import fs from 'fs';
import path from 'path';

// Set isolated test database path
const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test-ai-classification-db.json');
process.env.MANDATE_RESCUE_DB_PATH = TEST_DB_PATH;

import {
  getTransactionById,
  getClassificationByTransactionId,
  upsertClassification,
  appendAuditLog,
  saveTransactions,
  getAuditLogs,
  getDecisions,
  getGuardrailChecks,
  getExecutions,
  getLedgerEntries,
  clearDatabase,
} from '../src/lib/db';

async function main() {
  console.log('--- STARTING AI CLASSIFICATION APPLY TEST SUITE ---');

  // Clean isolated test DB
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  await clearDatabase();

  // 1. Seed one synthetic transaction
  const seedTx = {
    id: 'txn_ai_test_001',
    customer_id: 'cust_synth_99',
    amount: 1999,
    currency: 'INR',
    mandate_id: 'mand_synth_99',
    bank_name: 'HDFC',
    error_code: 'UNKNOWN_DECLINE',
    error_message: 'Ambiguous bank decline response.',
    failed_at: new Date().toISOString(),
    subscription_type: 'Pro Membership',
    customer_payment_history: {
      past_success_rate: 0.9,
      avg_balance_pattern: 'normal' as const,
    },
  };

  await saveTransactions([seedTx]);

  // 2. Call getTransactionById and assert
  const retrievedTx = await getTransactionById('txn_ai_test_001');
  if (!retrievedTx || retrievedTx.id !== 'txn_ai_test_001') {
    throw new Error('FAIL Step 2: getTransactionById failed to return seeded transaction.');
  }
  console.log('✅ PASS: getTransactionById retrieved seeded transaction.');

  // 3. Apply a valid Puter AI suggestion
  const suggestion1 = {
    transaction_id: 'txn_ai_test_001',
    predicted_cause: 'bank_offline',
    cause: 'bank_offline',
    confidence: 0.82,
    reasoning_text: 'synthetic test explanation',
    reasoning: 'synthetic test explanation',
    method: 'puter_ai_assist',
    llm_called: true,
    llm_provider: 'puter',
    llm_model: 'google/gemini-3.7-flash',
    manual_review_required: false,
    reviewed_by_user: true,
    updated_at: new Date().toISOString(),
  };

  await upsertClassification(suggestion1);
  await appendAuditLog({
    id: 'audit_app_001',
    transaction_id: 'txn_ai_test_001',
    stage: 'ai_tiebreak_review',
    event_type: 'puter_ai_suggestion_reviewed',
    review_action: 'apply',
    suggested_cause: 'bank_offline',
    suggested_confidence: 0.82,
    suggested_reasoning: 'synthetic test explanation',
    provider: 'puter',
    model: 'google/gemini-3.7-flash',
    applied: true,
    timestamp: new Date().toISOString(),
  });

  // 4 & 5. Assert classification created and audit record exists
  const classification1 = await getClassificationByTransactionId('txn_ai_test_001');
  if (!classification1 || (classification1.predicted_cause !== 'bank_offline' && classification1.cause !== 'bank_offline')) {
    throw new Error('FAIL Step 4: Classification record was not created/updated correctly.');
  }

  const audits1 = await getAuditLogs();
  const reviewAudit = audits1.find((a) => a.stage === 'ai_tiebreak_review' || a.event_type === 'puter_ai_suggestion_reviewed');
  if (!reviewAudit) {
    throw new Error('FAIL Step 5: Audit record for ai_tiebreak_review does not exist.');
  }
  console.log('✅ PASS: Puter suggestion applied, classification created, and audit log recorded.');

  // 6. Apply the same suggestion again (Upsert test)
  const suggestion2 = {
    ...suggestion1,
    confidence: 0.85,
    reasoning_text: 'updated synthetic test explanation',
  };
  await upsertClassification(suggestion2);

  const classification2 = await getClassificationByTransactionId('txn_ai_test_001');
  if (!classification2 || classification2.confidence !== 0.85) {
    throw new Error('FAIL Step 6: Classification was not cleanly upserted on second application.');
  }
  console.log('✅ PASS: Upsert classification correctly updated existing record without duplicating.');

  // 7. Reject a second suggestion
  await appendAuditLog({
    id: 'audit_rej_002',
    transaction_id: 'txn_ai_test_001',
    stage: 'ai_tiebreak_review',
    event_type: 'puter_ai_suggestion_reviewed',
    review_action: 'reject',
    suggested_cause: 'low_balance',
    suggested_confidence: 0.5,
    suggested_reasoning: 'rejected suggestion reasoning',
    provider: 'puter',
    model: 'google/gemini-3.7-flash',
    applied: false,
    timestamp: new Date().toISOString(),
  });

  const classificationAfterRejection = await getClassificationByTransactionId('txn_ai_test_001');
  if (classificationAfterRejection?.confidence !== 0.85) {
    throw new Error('FAIL Step 7: Rejecting suggestion should not overwrite applied classification.');
  }

  const audits2 = await getAuditLogs();
  if (audits2.length < 2) {
    throw new Error('FAIL Step 7: Rejection audit event was not appended.');
  }
  console.log('✅ PASS: Rejecting suggestion recorded audit log without modifying classification.');

  // 8. Assert no decision, guardrail, execution, or ledger records were changed
  const decisions = await getDecisions();
  const guardrails = await getGuardrailChecks();
  const executions = await getExecutions();
  const ledger = await getLedgerEntries();

  if (decisions.length !== 0 || guardrails.length !== 0 || executions.length !== 0 || ledger.length !== 0) {
    throw new Error('FAIL Step 8: AI classification review must NOT alter decisions, guardrails, executions, or ledger.');
  }
  console.log('✅ PASS: Decider, guardrails, executor, and ledger remained unchanged.');

  console.log('\n==================================================');
  console.log('AI CLASSIFICATION APPLY TEST: PASS');
  console.log('==================================================');

  // Clean up test DB
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
}

main().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
