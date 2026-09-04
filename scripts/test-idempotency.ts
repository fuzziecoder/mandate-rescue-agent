import fs from 'fs';
import path from 'path';

// Force isolated test database
const testDbPath = path.join(process.cwd(), 'data', 'test-idempotency-db.json');
process.env.MANDATE_RESCUE_DB_PATH = testDbPath;

import {
  writeDatabase,
  getTransactions,
  getLedgerEntries,
  getAuditLogs,
  saveExecutionOrUpsert,
  saveGuardrailCheckOrUpsert,
} from '../src/lib/db';
import { postRecoveryOnce, getLedgerReconciliation } from '../src/lib/ledger';
import { isEligibleForBatch } from '../src/lib/batchEligibility';
import { startBatchRun, processBatchTransaction } from '../src/lib/batchEngine';
import { processRazorpayWebhookEvent } from '../src/lib/webhooks/razorpayIngestion';
import { calculateTotalAtRisk, calculateRecoveredRevenue, calculateRecoveryRate } from '../src/lib/metrics';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function main() {
  console.log('=== RUNNING ISOLATED IDEMPOTENCY & FINANCIAL INVARIANTS TEST ===');

  // Clean test DB if exists
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  // 1. Seed 3 failed transactions
  const txA = {
    id: 'test_tx_A',
    customer_id: 'cust_A',
    amount: 1500,
    currency: 'INR',
    mandate_id: 'mand_A',
    bank_name: 'HDFC',
    error_code: 'BANK_TECHNICAL_ERROR',
    error_message: 'Bank downtime',
    failed_at: new Date().toISOString(),
    customer_payment_history: {
      past_success_rate: 0.9,
      avg_balance_pattern: 'normal' as const,
      payment_timing: 'on_time' as const,
      opt_out: false,
      recent_nudges_count: 0,
      past_retry_attempts: 0,
    },
    subscription_type: 'Annual Pro',
  };

  const txB = {
    id: 'test_tx_B',
    customer_id: 'cust_B',
    amount: 2500,
    currency: 'INR',
    mandate_id: 'mand_B',
    bank_name: 'ICICI',
    error_code: 'CUSTOMER_OPT_OUT',
    error_message: 'Customer requested opt-out',
    failed_at: new Date().toISOString(),
    customer_payment_history: {
      past_success_rate: 0.2,
      avg_balance_pattern: 'low' as const,
      payment_timing: 'very_late' as const,
      opt_out: true,
      recent_nudges_count: 3,
      past_retry_attempts: 3,
    },
    subscription_type: 'Monthly Pro',
  };

  const txC = {
    id: 'test_tx_C',
    customer_id: 'cust_C',
    amount: 500,
    currency: 'INR',
    mandate_id: 'mand_C',
    bank_name: 'SBI',
    error_code: 'INSUFFICIENT_FUNDS',
    error_message: 'Low account balance',
    failed_at: new Date().toISOString(),
    customer_payment_history: {
      past_success_rate: 0.7,
      avg_balance_pattern: 'normal' as const,
      payment_timing: 'on_time' as const,
      opt_out: false,
      recent_nudges_count: 0,
      past_retry_attempts: 0,
    },
    subscription_type: 'Monthly Basic',
  };

  const initialDbData = {
    transactions: [txA, txB, txC],
    classifications: [],
    decisions: [],
    guardrail_checks: [],
    executions: [],
    audit_log: [],
    promises: [],
    ledger: [],
    settings: { dispatch_kill_switch: false, updated_at: null, updated_by: 'test' },
    webhook_receipts: [],
    batch_runs: [],
  };

  writeDatabase(initialDbData);
  console.log('✓ Step 1: Seeded 3 test transactions (A: ₹1500, B: ₹2500, C: ₹500).');

  // 2. Process transaction A once & force recovery
  const postResA1 = await postRecoveryOnce({
    transactionId: txA.id,
    amount: txA.amount,
    rootCause: 'bank_offline',
    recoveryActionUsed: 'retry',
    channel: 'auto_retry',
    source: 'test',
  });
  await saveExecutionOrUpsert({
    transaction_id: txA.id,
    action_taken: 'retry',
    outcome: 'recovered',
    amount_recovered: txA.amount,
    executed_at: new Date().toISOString(),
  });

  assert(postResA1.inserted === true, 'First recovery of A must insert a ledger entry');
  assert(postResA1.duplicate === false, 'First recovery of A must not be marked duplicate');

  const ledgerAfterA = await getLedgerEntries();
  assert(ledgerAfterA.length === 1, 'Ledger count must be 1 after processing A');
  assert(ledgerAfterA[0].amount === txA.amount, `Ledger amount must equal A amount (${txA.amount})`);
  console.log('✓ Step 2: Transaction A processed & recovered once. 1 ledger row created.');

  // 3. Process transaction A again (check batch eligibility)
  const eligibilityA = await isEligibleForBatch(txA.id);
  assert(eligibilityA.eligible === false, 'Transaction A must be ineligible for batch rerun');
  assert(eligibilityA.reason.includes('Already posted'), 'Ineligibility reason must mention already posted');

  // Also try running pipeline on A again
  const postResA2 = await postRecoveryOnce({
    transactionId: txA.id,
    amount: txA.amount,
    rootCause: 'bank_offline',
    recoveryActionUsed: 'retry',
    channel: 'auto_retry',
  });
  assert(postResA2.inserted === false, 'Second recovery post of A must return inserted=false');
  assert(postResA2.duplicate === true, 'Second recovery post of A must return duplicate=true');

  const ledgerAfterA2 = await getLedgerEntries();
  assert(ledgerAfterA2.length === 1, 'Ledger count must remain 1 after re-running A');
  console.log('✓ Step 3: Transaction A rerun correctly skipped and duplicate recovery prevented.');

  // 4. Try direct postRecoveryOnce for fresh transaction D twice
  const postResD1 = await postRecoveryOnce({
    transactionId: 'test_tx_D',
    amount: 1000,
    rootCause: 'low_balance',
  });
  assert(postResD1.inserted === true, 'First direct post of D must insert');

  const postResD2 = await postRecoveryOnce({
    transactionId: 'test_tx_D',
    amount: 1000,
    rootCause: 'low_balance',
  });
  assert(postResD2.inserted === false, 'Second direct post of D must be duplicate');
  assert(postResD2.duplicate === true, 'Second direct post of D duplicate flag must be true');
  console.log('✓ Step 4: Direct postRecoveryOnce twice correctly returns duplicate=true.');

  // 5. Process transaction B and stop it
  await saveExecutionOrUpsert({
    transaction_id: txB.id,
    action_taken: 'stop',
    outcome: 'stopped',
    amount_recovered: 0,
    executed_at: new Date().toISOString(),
    stop_reason: 'Opted out by customer',
  });
  await saveGuardrailCheckOrUpsert({
    transaction_id: txB.id,
    check_name: 'opt_out',
    passed: false,
    detail: 'Customer has opted out of communications',
  });

  const eligibilityB = await isEligibleForBatch(txB.id);
  assert(eligibilityB.eligible === false, 'Stopped transaction B must be ineligible for batch execution');
  assert(eligibilityB.reason.includes('stopped'), 'Ineligibility reason must mention stopped');
  console.log('✓ Step 5: Transaction B stopped & correctly marked ineligible for batch.');

  // 6. Process transaction C as pending
  const eligibilityC = await isEligibleForBatch(txC.id);
  assert(eligibilityC.eligible === true, 'Unprocessed pending transaction C must be eligible for batch');
  console.log('✓ Step 6: Transaction C is eligible for batch.');

  // 7. Verify overall portfolio metrics calculation
  const allTxs = await getTransactions();
  const ledgerEntries = await getLedgerEntries();

  const totalAtRisk = calculateTotalAtRisk(allTxs);
  const totalRecovered = calculateRecoveredRevenue(ledgerEntries);
  const recoveryRate = calculateRecoveryRate(totalRecovered, totalAtRisk);
  const recon = await getLedgerReconciliation();

  assert(totalAtRisk === txA.amount + txB.amount + txC.amount, 'Total at risk must equal sum of 3 source transactions');
  assert(totalRecovered === txA.amount + 1000, 'Total recovered must equal sum of unique ledger entries');
  assert(recoveryRate <= 100, 'Recovery rate must never exceed 100%');
  assert(recon.isBalanced === true, 'Ledger reconciliation must be balanced');
  console.log('✓ Step 7: Portfolio metrics verified (AtRisk: ₹' + totalAtRisk + ', Recovered: ₹' + totalRecovered + ', Rate: ' + recoveryRate.toFixed(2) + '%).');

  // 8. Webhook-style replay test: replay payment.captured event for txA twice
  const webhookPayload = {
    event: 'payment.captured',
    event_id: 'evt_replay_test_001',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: 'pay_replay_001',
          amount: txA.amount * 100,
          currency: 'INR',
          notes: { original_transaction_id: txA.id },
        },
      },
    },
  };

  const whRes1 = await processRazorpayWebhookEvent(webhookPayload, true);
  const whRes2 = await processRazorpayWebhookEvent(webhookPayload, true);

  assert(whRes1.status === 'processed', 'First webhook call must be processed');
  assert(whRes2.status === 'ignored', 'Replayed duplicate webhook event must be ignored');

  const finalLedger = await getLedgerEntries();
  const txALedgerRows = finalLedger.filter(e => e.transaction_id === txA.id);
  assert(txALedgerRows.length === 1, 'Transaction A must have exactly 1 ledger row after webhook replay');
  console.log('✓ Step 8: Webhook replay test passed. Duplicate webhook event safely ignored.');

  // Clean up test DB file
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('\nIDEMPOTENCY TEST: PASS');
}

main().catch(err => {
  console.error('Idempotency test error:', err);
  process.exit(1);
});
