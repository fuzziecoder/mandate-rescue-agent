import fs from 'fs';
import path from 'path';

// Force isolated test DB path
const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-webhook-db.json');
process.env.MANDATE_RESCUE_DB_PATH = TEST_DB_PATH;

import { ingestRazorpayWebhookEvent } from '../src/lib/webhooks/razorpayIngestion';
import { getTransactions, getAuditLogs, getLedgerEntries, clearDatabase } from '../src/lib/db';

async function main() {
  console.log('--- STARTING RAZORPAY WEBHOOK ADAPTER TEST SUITE ---');

  // Ensure fresh isolated test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  await clearDatabase();

  const loadFixture = (filename: string) => {
    const filePath = path.join(process.cwd(), 'fixtures', 'razorpay', `${filename}.json`);
    const rawBody = fs.readFileSync(filePath, 'utf8');
    const payload = JSON.parse(rawBody);
    return { rawBody, payload, eventType: payload.event || filename };
  };

  // STEP 1: Process payment.failed
  console.log('\n1. Processing payment.failed fixture...');
  const fix1 = loadFixture('payment.failed');
  const res1 = await ingestRazorpayWebhookEvent({
    eventType: fix1.eventType,
    rawBody: fix1.rawBody,
    payload: fix1.payload,
    mode: 'simulation',
  });

  console.log(`- Status: ${res1.status}, TxID: ${res1.normalizedTransactionId}`);
  const txs1 = await getTransactions();
  const ledger1 = await getLedgerEntries();
  const audit1 = await getAuditLogs();

  if (res1.status !== 'processed') throw new Error('FAIL Step 1: Status must be processed');
  if (txs1.length !== 1) throw new Error('FAIL Step 1: Exactly 1 transaction must be created');
  if (ledger1.length !== 0) throw new Error('FAIL Step 1: Zero ledger entries must be created on failure');
  if (audit1.length === 0) throw new Error('FAIL Step 1: Audit entries must be recorded');
  console.log('✅ PASS: payment.failed ingested cleanly and processed via recovery pipeline.');

  // STEP 2: Replay payment.failed (Idempotency test)
  console.log('\n2. Replaying exact same payment.failed fixture (Idempotency test)...');
  const res2 = await ingestRazorpayWebhookEvent({
    eventType: fix1.eventType,
    rawBody: fix1.rawBody,
    payload: fix1.payload,
    mode: 'simulation',
  });

  console.log(`- Status: ${res2.status}`);
  const txs2 = await getTransactions();
  const ledger2 = await getLedgerEntries();

  if (res2.status !== 'duplicate') throw new Error('FAIL Step 2: Replayed failure must return duplicate status');
  if (txs2.length !== 1) throw new Error('FAIL Step 2: Transaction count must not increase on duplicate');
  if (ledger2.length !== 0) throw new Error('FAIL Step 2: Ledger entries must remain zero');
  console.log('✅ PASS: Replayed payment.failed correctly blocked by webhook idempotency layer.');

  // STEP 3: Process matching subscription.charged success event
  console.log('\n3. Processing matching subscription.charged fixture...');
  const fix3 = loadFixture('subscription.charged');
  const res3 = await ingestRazorpayWebhookEvent({
    eventType: fix3.eventType,
    rawBody: fix3.rawBody,
    payload: fix3.payload,
    mode: 'simulation',
  });

  console.log(`- Status: ${res3.status}, Ledger Posted: ${res3.ledgerPosted}`);
  const ledger3 = await getLedgerEntries();

  if (res3.status !== 'processed') throw new Error('FAIL Step 3: Status must be processed');
  if (res3.ledgerPosted !== true) throw new Error('FAIL Step 3: Ledger entry must be posted for verified success');
  if (ledger3.length !== 1) throw new Error('FAIL Step 3: Exactly 1 ledger entry must exist');
  if (ledger3[0].amount !== 1499) throw new Error(`FAIL Step 3: Ledger amount must equal ₹1499, got ₹${ledger3[0].amount}`);
  console.log('✅ PASS: Success webhook verified and ₹1,499 posted to Recovery Ledger.');

  // STEP 4: Replay subscription.charged success event
  console.log('\n4. Replaying exact same subscription.charged fixture...');
  const res4 = await ingestRazorpayWebhookEvent({
    eventType: fix3.eventType,
    rawBody: fix3.rawBody,
    payload: fix3.payload,
    mode: 'simulation',
  });

  console.log(`- Status: ${res4.status}`);
  const ledger4 = await getLedgerEntries();

  if (res4.status !== 'duplicate') throw new Error('FAIL Step 4: Replayed success must return duplicate status');
  if (ledger4.length !== 1) throw new Error('FAIL Step 4: Ledger count must remain 1');
  if (ledger4[0].amount !== 1499) throw new Error('FAIL Step 4: Total recovered amount must not increase');
  console.log('✅ PASS: Replayed success event blocked. No double-counting in Recovery Ledger.');

  // STEP 5: Process subscription.halted fixture
  console.log('\n5. Processing subscription.halted fixture...');
  const fix5 = loadFixture('subscription.halted');
  const res5 = await ingestRazorpayWebhookEvent({
    eventType: fix5.eventType,
    rawBody: fix5.rawBody,
    payload: fix5.payload,
    mode: 'simulation',
  });

  console.log(`- Status: ${res5.status}`);
  const ledger5 = await getLedgerEntries();
  const audit5 = await getAuditLogs();
  const haltedAudit = audit5.find((a) => a.event_type === 'razorpay_subscription_halted');

  if (res5.status !== 'processed') throw new Error('FAIL Step 5: Status must be processed');
  if (!haltedAudit) throw new Error('FAIL Step 5: Halted audit entry must exist');
  if (ledger5.length !== 1) throw new Error('FAIL Step 5: Ledger count must remain 1 (no money recovered on halt)');
  console.log('✅ PASS: Subscription halted recorded cleanly without fake revenue.');

  // STEP 6: Unmatched success scenario
  console.log('\n6. Testing unmatched success event...');
  const unmatchedPayload = {
    entity: 'event',
    event: 'payment.captured',
    event_id: 'evt_unmatched_999',
    payload: {
      payment: {
        entity: {
          id: 'pay_unmatched_999',
          amount: 50000,
          currency: 'INR',
          token_id: 'token_nonexistent',
        },
      },
    },
  };

  const res6 = await ingestRazorpayWebhookEvent({
    eventType: 'payment.captured',
    rawBody: JSON.stringify(unmatchedPayload),
    payload: unmatchedPayload,
    mode: 'simulation',
  });

  console.log(`- Status: ${res6.status}, Ledger Posted: ${res6.ledgerPosted}`);
  const ledger6 = await getLedgerEntries();
  if (res6.ledgerPosted !== false) throw new Error('FAIL Step 6: Ledger entry must NOT be posted for unmatched success');
  if (ledger6.length !== 1) throw new Error('FAIL Step 6: Ledger count must remain 1');
  console.log('✅ PASS: Unmatched success event safely audited without ledger write.');

  console.log('\n==================================================');
  console.log('🎉 WEBHOOK ADAPTER TEST: PASS');
  console.log('==================================================');

  // Clean up test database file
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
}

main().catch((err) => {
  console.error('❌ WEBHOOK ADAPTER TEST FAILED:', err);
  process.exit(1);
});
