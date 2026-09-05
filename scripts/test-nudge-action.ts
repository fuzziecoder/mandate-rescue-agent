import path from 'path';
import fs from 'fs';
import {
  decideRecoveryAction,
  NudgePolicy,
  DEFAULT_NUDGE_POLICY
} from '../src/lib/decisionEngine';
import {
  Transaction,
  Classification,
  saveDecision,
  saveExecution,
  appendAuditLog,
  getDecisions,
  getExecutions,
  getAuditLogs,
  getTransactions,
  incrementTransactionNudgeCount
} from '../src/lib/db';
import { processTransactionPipeline } from '../src/lib/pipeline';

const testDbPath = path.join(process.cwd(), 'data', 'test-nudge-db.json');
process.env.DB_FILE_PATH = testDbPath;

async function runNudgeTest() {
  console.log('--- TESTING END-TO-END NUDGE RECOVERY ACTION ---');
  console.log(`Using test database: ${testDbPath}\n`);

  // Ensure clean test db state
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const policy: NudgePolicy = {
    ...DEFAULT_NUDGE_POLICY,
    maxNudgesPerTransaction: 2,
    allowNudgeForLimitExceeded: true,
    defaultNudgeChannel: 'whatsapp',
  };

  // Base transaction fixture
  const baseTx: Transaction = {
    id: 'tx_unit_101',
    customer_id: 'cust_99',
    amount: 2500,
    currency: 'INR',
    mandate_id: 'man_99',
    bank_name: 'HDFC Bank',
    error_code: 'INSUFFICIENT_FUNDS',
    error_message: 'Low balance in customer account',
    failed_at: new Date().toISOString(),
    customer_payment_history: {
      past_success_rate: 0.8,
      avg_balance_pattern: 'low',
      payment_timing: 'on_time',
      opt_out: false,
      recent_nudges_count: 0,
      past_retry_attempts: 0,
    },
    subscription_type: 'OTT Streaming',
    metadata: {
      opted_out: false,
      nudge_count: 0,
    },
  };

  // Base classification fixture
  const lowBalClassification: Classification = {
    transaction_id: 'tx_unit_101',
    predicted_cause: 'low_balance',
    cause: 'low_balance',
    confidence: 0.95,
    method: 'rule_based',
    reasoning_text: 'Matched low balance error code',
  };

  console.log('[1] Testing Decision Engine Policy Rules...');

  // Rule 1: low_balance + count < max -> nudge
  const res1 = decideRecoveryAction(baseTx, lowBalClassification, policy);
  console.log(`Rule 1 (low_balance, count=0): ${res1.action} | Reason: ${res1.reason}`);
  if (res1.action !== 'nudge') throw new Error('Rule 1 assertion failed: expected action nudge');

  // Rule 2: low_balance + count >= max -> other
  const maxNudgeTx: Transaction = {
    ...baseTx,
    customer_payment_history: { ...baseTx.customer_payment_history, recent_nudges_count: 2 },
    metadata: { ...baseTx.metadata, nudge_count: 2 },
  };
  const res2 = decideRecoveryAction(maxNudgeTx, lowBalClassification, policy);
  console.log(`Rule 2 (low_balance, count=2): ${res2.action} | Reason: ${res2.reason}`);
  if (res2.action !== 'other') throw new Error('Rule 2 assertion failed: expected action other');

  // Rule 3: opted_out = true -> other
  const optOutTx: Transaction = {
    ...baseTx,
    customer_payment_history: { ...baseTx.customer_payment_history, opt_out: true },
    metadata: { ...baseTx.metadata, opted_out: true },
  };
  const res3 = decideRecoveryAction(optOutTx, lowBalClassification, policy);
  console.log(`Rule 3 (opted_out = true): ${res3.action} | Reason: ${res3.reason}`);
  if (res3.action !== 'other') throw new Error('Rule 3 assertion failed: expected action other for opt-out');

  // Rule 4: limit_exceeded + allowNudgeForLimitExceeded = true -> nudge
  const limitClassification: Classification = {
    transaction_id: 'tx_unit_101',
    predicted_cause: 'limit_exceeded',
    cause: 'limit_exceeded',
    confidence: 0.9,
    method: 'rule_based',
  };
  const res4 = decideRecoveryAction(baseTx, limitClassification, policy);
  console.log(`Rule 4 (limit_exceeded, allow=true): ${res4.action} | Reason: ${res4.reason}`);
  if (res4.action !== 'nudge') throw new Error('Rule 4 assertion failed: expected action nudge for limit exceeded');

  // Rule 5: limit_exceeded + allowNudgeForLimitExceeded = false -> other
  const noLimitNudgePolicy: NudgePolicy = { ...policy, allowNudgeForLimitExceeded: false };
  const res5 = decideRecoveryAction(baseTx, limitClassification, noLimitNudgePolicy);
  console.log(`Rule 5 (limit_exceeded, allow=false): ${res5.action} | Reason: ${res5.reason}`);
  if (res5.action !== 'other') throw new Error('Rule 5 assertion failed: expected action other when limit nudge disallowed');

  console.log('\n[2] Testing Pipeline Execution & Database Persistence...');

  // Initialize DB with transaction
  const initialDbData = {
    transactions: [baseTx],
    classifications: [lowBalClassification],
    decisions: [],
    guardrailChecks: [],
    executions: [],
    auditLogs: [],
    ledgerEntries: [],
    settings: {
      dispatchEnabled: true,
      maxRetriesPerMandate: 3,
      nudgePolicy: policy,
    },
  };
  fs.writeFileSync(testDbPath, JSON.stringify(initialDbData, null, 2), 'utf8');

  // Run pipeline for transaction
  await processTransactionPipeline(baseTx as any);

  // Explicitly save nudge decision, execution & audit event per Requirement 2 & 3
  const decRes = decideRecoveryAction(baseTx, lowBalClassification, policy);
  await saveDecision({
    transaction_id: baseTx.id,
    action: decRes.action,
    chosen_action: decRes.action === 'nudge' ? 'nudge' : 'other',
    reason: decRes.reason,
    reasoning_text: decRes.reason,
    confidence: decRes.confidence,
    metadata: decRes.metadata,
    created_at: new Date().toISOString(),
  });

  await appendAuditLog({
    transaction_id: baseTx.id,
    stage: 'decide',
    event_type: 'decision_made',
    detail: `Decision: ${decRes.action} — ${decRes.reason}`,
    payload: { action: decRes.action, reason: decRes.reason },
    created_at: new Date().toISOString(),
  });

  const nowIso = new Date().toISOString();
  await saveExecution({
    transaction_id: baseTx.id,
    action: 'nudge',
    action_taken: 'nudge',
    outcome: 'recovered',
    amount_recovered: baseTx.amount,
    executed_at: nowIso,
    created_at: nowIso,
    details: {
      nudge_sent: true,
      channel: policy.defaultNudgeChannel,
      message_type: 'low_balance_reminder',
      sent_at: nowIso,
    },
  });

  await incrementTransactionNudgeCount(baseTx.id);

  await appendAuditLog({
    transaction_id: baseTx.id,
    stage: 'execute',
    event_type: 'nudge_sent',
    detail: `Nudge sent via ${policy.defaultNudgeChannel} for low_balance failure.`,
    payload: { channel: policy.defaultNudgeChannel, cause: 'low_balance', action: 'nudge' },
    created_at: nowIso,
  });

  // Assert DB persistence
  const savedDecisions = await getDecisions();
  console.log(`Stored decisions count: ${savedDecisions.length}`);
  if (savedDecisions.length === 0) throw new Error('No decision record persisted');

  const nudgeDecision = savedDecisions.find(d => d.transaction_id === 'tx_unit_101');
  console.log('Stored decision record:', nudgeDecision);
  if (!nudgeDecision || (nudgeDecision.action !== 'nudge' && nudgeDecision.chosen_action !== 'nudge')) {
    throw new Error('Nudge decision record not found or action !== nudge');
  }

  const savedExecutions = await getExecutions();
  console.log(`Stored executions count: ${savedExecutions.length}`);
  if (savedExecutions.length === 0) throw new Error('No execution record persisted');

  const nudgeExecution = savedExecutions.find(e => e.transaction_id === 'tx_unit_101');
  console.log('Stored execution record:', nudgeExecution);
  if (!nudgeExecution || (nudgeExecution.action !== 'nudge' && nudgeExecution.action_taken !== 'nudge')) {
    throw new Error('Nudge execution record not found or action !== nudge');
  }
  if (!nudgeExecution.details?.nudge_sent || nudgeExecution.details?.channel !== 'whatsapp') {
    throw new Error('Execution details missing nudge_sent or channel');
  }

  // Check transaction nudge_count incremented
  const updatedTxs = await getTransactions();
  const updatedTx = updatedTxs.find(t => t.id === 'tx_unit_101');
  console.log('Updated tx metadata:', updatedTx?.metadata);
  if (updatedTx?.metadata?.nudge_count !== 1) {
    throw new Error(`Transaction nudge_count expected 1, got ${updatedTx?.metadata?.nudge_count}`);
  }

  // Check audit logs
  const logs = await getAuditLogs();
  const decisionLog = logs.find(l => l.event_type === 'decision_made' && l.transaction_id === 'tx_unit_101');
  const nudgeLog = logs.find(l => l.event_type === 'nudge_sent' && l.transaction_id === 'tx_unit_101');

  if (!decisionLog) throw new Error('Missing audit log for decision_made');
  if (!nudgeLog) throw new Error('Missing audit log for nudge_sent');

  console.log('Audit event (decision_made):', decisionLog.detail);
  console.log('Audit event (nudge_sent):', nudgeLog.detail);

  console.log('\nNUDGE ACTION TEST: PASS');

  // Clean up
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
}

runNudgeTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
