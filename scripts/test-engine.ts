import { classifyFailure } from '../src/lib/classify';
import { isQuietHour } from '../src/lib/guardrails';
import { postRecovery, getAllEntries } from '../src/lib/ledger';
import { clearDatabase } from '../src/lib/db';
import assert from 'assert';

async function runTests() {
  console.log("==========================================");
  console.log("Running Core Engine Unit Tests...");
  console.log("==========================================");

  // Test 1: Classifier correctness
  console.log("Test 1: Classifier correctness on Low Balance...");
  const tx1 = {
    id: "t1",
    amount: 1000,
    currency: "INR",
    attemptDate: new Date().toISOString(),
    debitWindow: "morning",
    errorCode: "UPI_INSUFFICIENT_FUNDS",
    errorMessage: "The account does not have sufficient balance",
    bank: "HDFC",
    customerId: "c1",
    customerName: "Aman",
    balanceHistory: []
  };
  const cls = classifyFailure(tx1);
  assert.strictEqual(cls.cause, "low_balance");
  console.log("✓ Test 1: Low Balance classifier check passed!");

  console.log("Test 1.1: Classifier correctness on Expired Mandate...");
  const tx2 = {
    id: "t2",
    amount: 1500,
    currency: "INR",
    attemptDate: new Date().toISOString(),
    debitWindow: "afternoon",
    errorCode: "UPI_MANDATE_EXPIRED",
    errorMessage: "Validity exceeded",
    bank: "ICICI",
    customerId: "c2",
    customerName: "Rahul",
    balanceHistory: []
  };
  const cls2 = classifyFailure(tx2);
  assert.strictEqual(cls2.cause, "mandate_expired");
  console.log("✓ Test 1.1: Expired Mandate classifier check passed!");

  // Test 2: Guardrail quiet hours
  console.log("Test 2: Guardrail quiet hours checks (IST)...");
  // 10:00 PM IST (Quiet Hours: 8 PM - 9 AM)
  const quietDate = new Date("2026-08-30T22:00:00+05:30");
  assert.strictEqual(isQuietHour(quietDate), true, "10:00 PM IST should be quiet hours");

  // 12:00 PM IST (Active Hours)
  const activeDate = new Date("2026-08-30T12:00:00+05:30");
  assert.strictEqual(isQuietHour(activeDate), false, "12:00 PM IST should not be quiet hours");
  console.log("✓ Test 2: Quiet hours checks passed!");

  // Test 3: Ledger idempotency
  console.log("Test 3: Ledger idempotency (no double-counting)...");
  await clearDatabase();
  
  const entry = {
    transactionId: "t_test_id",
    amount: 500,
    rootCause: "low_balance",
    recoveryActionUsed: "nudge",
    channel: "sms",
    timestamp: new Date().toISOString(),
    confidence: 1.0
  };
  
  await postRecovery(entry);
  await postRecovery(entry); // double post

  const entries = await getAllEntries();
  const matched = entries.filter(e => e.transactionId === "t_test_id");
  assert.strictEqual(matched.length, 1, "Ledger should enforce idempotency on transactionId");
  console.log("✓ Test 3: Ledger idempotency passed!");

  console.log("==========================================");
  console.log("All unit tests passed successfully!");
  console.log("==========================================");
}

runTests().catch(e => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
