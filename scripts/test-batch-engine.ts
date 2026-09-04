import fs from 'fs';
import path from 'path';

// Force isolated test database
const testDbPath = path.join(process.cwd(), 'data', 'test-batch-db.json');
process.env.MANDATE_RESCUE_DB_PATH = testDbPath;
process.env.BATCH_DEMO_DELAY_MS = '0';

import {
  writeDatabase,
  getTransactions,
  getSettings,
  updateSettings,
  getLatestBatchRun,
  getLedgerEntries,
  Transaction,
} from '../src/lib/db';
import { startBatchRun, runBatchAsync, requestPauseBatch, resumeBatch } from '../src/lib/batchEngine';

async function main() {
  console.log('--- TESTING PERSISTED BATCH ENGINE ---');
  console.log(`Using test database: ${testDbPath}`);

  // 1. Seed small test database
  const seedTransactions: Transaction[] = [
    {
      id: 'tx_test_101',
      customer_id: 'cust_test_1',
      amount: 5000,
      currency: 'INR',
      mandate_id: 'mand_test_1',
      bank_name: 'HDFC',
      error_code: 'BANK_OFFLINE',
      error_message: 'Bank server down',
      failed_at: new Date().toISOString(),
      customer_payment_history: { past_success_rate: 0.9, avg_balance_pattern: 'normal' },
      subscription_type: 'Pro Plan',
    },
    {
      id: 'tx_test_102',
      customer_id: 'cust_test_2',
      amount: 10000,
      currency: 'INR',
      mandate_id: 'mand_test_2',
      bank_name: 'ICICI',
      error_code: 'INSUFFICIENT_FUNDS',
      error_message: 'Low balance',
      failed_at: new Date().toISOString(),
      customer_payment_history: { past_success_rate: 0.8, avg_balance_pattern: 'low', opt_out: false },
      subscription_type: 'Enterprise Plan',
    },
    {
      id: 'tx_test_103',
      customer_id: 'cust_test_3',
      amount: 2500,
      currency: 'INR',
      mandate_id: 'mand_test_3',
      bank_name: 'SBI',
      error_code: 'MANDATE_EXPIRED',
      error_message: 'Mandate expired',
      failed_at: new Date().toISOString(),
      customer_payment_history: { past_success_rate: 0.5, avg_balance_pattern: 'erratic' },
      subscription_type: 'Basic Plan',
    },
  ];

  const initialDb = {
    transactions: seedTransactions,
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

  writeDatabase(initialDb);
  console.log('Seeded 3 test transactions.');

  // 2. Start batch
  const batchRunRes = await startBatchRun({ source: 'test_script', transactionIds: 'all', delayMs: 0 });
  console.log(`Created batch run ${batchRunRes.batchId} with status ${batchRunRes.status}`);

  // Wait for batch loop to complete
  if (batchRunRes.batchId) {
    await runBatchAsync(batchRunRes.batchId, seedTransactions.map(t => t.id), 0);
  }

  const completedBatch = await getLatestBatchRun();
  console.log(`Batch final status: ${completedBatch?.status}, Processed: ${completedBatch?.processed}/${completedBatch?.total}`);
  if (completedBatch?.status !== 'completed' || completedBatch?.processed !== 3) {
    console.error('FAIL: Batch run did not reach completed state with 3/3 processed.');
    process.exit(1);
  }

  // Seed fresh eligible transaction for second batch run
  const freshTx: Transaction = {
    id: 'tx_test_104',
    customer_id: 'cust_test_4',
    amount: 1500,
    currency: 'INR',
    mandate_id: 'mand_test_4',
    bank_name: 'AXIS',
    error_code: 'BANK_OFFLINE',
    error_message: 'Bank offline',
    failed_at: new Date().toISOString(),
    customer_payment_history: { past_success_rate: 0.9, avg_balance_pattern: 'normal' },
    subscription_type: 'Pro Plan',
  };
  const currentDb = JSON.parse(fs.readFileSync(testDbPath, 'utf8'));
  currentDb.transactions.push(freshTx);
  fs.writeFileSync(testDbPath, JSON.stringify(currentDb, null, 2), 'utf8');

  const run2Res = await startBatchRun({ source: 'test_script_2', transactionIds: 'all', delayMs: 0 });
  
  // Pause batch via kill-switch request
  if (run2Res.batchId) {
    await requestPauseBatch(run2Res.batchId);
  }
  const settings = await getSettings();
  console.log(`Kill-switch active: ${settings.dispatch_kill_switch}`);
  if (!settings.dispatch_kill_switch) {
    console.error('FAIL: Kill switch was not activated.');
    process.exit(1);
  }

  const pausedBatch = await getLatestBatchRun();
  console.log(`Batch state after kill-switch: ${pausedBatch?.status}`);
  if (pausedBatch?.status !== 'paused') {
    console.error(`FAIL: Batch status is ${pausedBatch?.status}, expected paused.`);
    process.exit(1);
  }

  // Resume batch
  console.log('Resuming batch after enabling dispatch...');
  if (run2Res.batchId) {
    await resumeBatch(run2Res.batchId);
    await runBatchAsync(run2Res.batchId, seedTransactions.map(t => t.id), 0);
  }

  const resumedBatch = await getLatestBatchRun();
  console.log(`Batch state after resume completion: ${resumedBatch?.status}`);
  if (resumedBatch?.status !== 'completed') {
    console.error(`FAIL: Resumed batch state is ${resumedBatch?.status}, expected completed.`);
    process.exit(1);
  }

  // 4. Test Ledger Idempotency
  const ledgerEntries = await getLedgerEntries();
  const txIdCounts = new Map<string, number>();
  for (const entry of ledgerEntries) {
    txIdCounts.set(entry.transaction_id, (txIdCounts.get(entry.transaction_id) || 0) + 1);
  }

  let hasDuplicates = false;
  for (const [txId, count] of Array.from(txIdCounts.entries())) {
    if (count > 1) {
      console.error(`FAIL: Transaction ${txId} has ${count} ledger entries (idempotency broken).`);
      hasDuplicates = true;
    }
  }

  if (hasDuplicates) {
    process.exit(1);
  }
  console.log('Ledger idempotency check passed: zero duplicate recoveries.');

  // Clean up temporary test DB
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  } catch (_) {}

  console.log('\nBATCH ENGINE TEST: PASS');
}

main().catch((err) => {
  console.error('Test batch engine error:', err);
  process.exit(1);
});
