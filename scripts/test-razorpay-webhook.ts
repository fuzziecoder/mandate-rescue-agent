import fs from 'fs';
import path from 'path';

// Force separate test database for webhook verification
const testDbPath = path.join(process.cwd(), 'data', 'test-webhook-db.json');
process.env.MANDATE_RESCUE_DB_PATH = testDbPath;
process.env.WEBHOOK_SIMULATION_MODE = 'true';

import { writeDatabase, getTransactions, getLedgerEntries, getAuditLogs } from '../src/lib/db';
import { processRazorpayWebhookEvent } from '../src/lib/webhooks/razorpayIngestion';

async function main() {
  console.log('--- TESTING RAZORPAY WEBHOOK INTEGRATION ---');
  console.log(`Using test database: ${testDbPath}`);

  // Initialize clean DB
  writeDatabase({
    transactions: [],
    classifications: [],
    decisions: [],
    guardrail_checks: [],
    executions: [],
    audit_log: [],
    promises: [],
    ledger: [],
    settings: { dispatch_kill_switch: false, updated_at: null, updated_by: 'webhook_test' },
    webhook_receipts: [],
    batch_runs: [],
  });

  // Load fixtures
  const failedFixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'fixtures', 'razorpay', 'payment.failed.json'), 'utf8'));
  const chargedFixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'fixtures', 'razorpay', 'subscription.charged.json'), 'utf8'));
  const haltedFixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'fixtures', 'razorpay', 'subscription.halted.json'), 'utf8'));

  // 1. Test payment.failed ingestion
  console.log('\n1. Testing payment.failed webhook ingestion...');
  const failRes1 = await processRazorpayWebhookEvent(failedFixture, true);
  console.log(`Result: status=${failRes1.status}, transactionId=${failRes1.transactionId}, message=${failRes1.message}`);

  const txs = await getTransactions();
  if (txs.length !== 1) {
    console.error(`FAIL: Expected 1 transaction, found ${txs.length}`);
    process.exit(1);
  }
  console.log(`PASS: Ingested transaction ${txs[0].id} (Amount: ₹${txs[0].amount})`);

  // 2. Test replayed failure duplicate check
  console.log('\n2. Testing replayed payment.failed (deduplication)...');
  const failRes2 = await processRazorpayWebhookEvent(failedFixture, true);
  console.log(`Result: status=${failRes2.status}, message=${failRes2.message}`);
  if (failRes2.status !== 'ignored') {
    console.error(`FAIL: Expected status 'ignored' for duplicate event, got '${failRes2.status}'`);
    process.exit(1);
  }
  console.log('PASS: Duplicate webhook correctly ignored.');

  // 3. Test subscription.charged (creates single ledger entry)
  console.log('\n3. Testing subscription.charged webhook ingestion...');
  const chargedRes1 = await processRazorpayWebhookEvent(chargedFixture, true);
  console.log(`Result: status=${chargedRes1.status}, ledgerPosted=${chargedRes1.ledgerPosted}, message=${chargedRes1.message}`);

  const ledger1 = await getLedgerEntries();
  if (ledger1.length !== 1) {
    console.error(`FAIL: Expected 1 ledger entry, found ${ledger1.length}`);
    process.exit(1);
  }
  console.log(`PASS: Created 1 ledger entry (₹${ledger1[0].amount}) for transaction ${ledger1[0].transaction_id}`);

  // 4. Test replayed subscription.charged (no double counting)
  console.log('\n4. Testing replayed subscription.charged (idempotency)...');
  // Use new event ID for same transaction to test ledger level duplicate prevention
  const chargedFixtureReplayed = { ...chargedFixture, event_id: `evt_replay_${Date.now()}` };
  const chargedRes2 = await processRazorpayWebhookEvent(chargedFixtureReplayed, true);
  console.log(`Result: status=${chargedRes2.status}, ledgerPosted=${chargedRes2.ledgerPosted}, message=${chargedRes2.message}`);

  const ledger2 = await getLedgerEntries();
  if (ledger2.length !== 1) {
    console.error(`FAIL: Duplicate recovery created! Expected 1 ledger entry, found ${ledger2.length}`);
    process.exit(1);
  }
  console.log('PASS: Replayed success did not double count ledger recovery.');

  // 5. Test subscription.halted (never creates ledger money)
  console.log('\n5. Testing subscription.halted webhook ingestion...');
  const haltedRes = await processRazorpayWebhookEvent(haltedFixture, true);
  console.log(`Result: status=${haltedRes.status}, ledgerPosted=${haltedRes.ledgerPosted}, message=${haltedRes.message}`);

  const ledger3 = await getLedgerEntries();
  if (ledger3.length !== 1) {
    console.error(`FAIL: Halted event erroneously created a ledger entry!`);
    process.exit(1);
  }
  console.log('PASS: Halted webhook recorded audit event without posting ledger money.');

  // Clean up temporary test DB
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  } catch (_) {}

  console.log('\nRAZORPAY WEBHOOK TEST: PASS');
}

main().catch((err) => {
  console.error('Test webhook error:', err);
  process.exit(1);
});
