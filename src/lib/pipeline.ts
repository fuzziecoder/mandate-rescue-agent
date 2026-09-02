import { FailedTransaction, RootCause, RecoveryAction, PipelineStep, Outcome } from './types';
import { classifyFailure } from './classify';
import { decideRecovery } from './decide';
import { contactAllowed } from './guardrails';
import { postRecovery } from './ledger';
import { saveClassification, saveDecision, saveGuardrailCheck, saveExecution, saveAuditLog } from './db';

export interface PipelineTrace {
  transaction: FailedTransaction;
  steps: PipelineStep[];
  outcome: Outcome;
  recoveryActionUsed?: RecoveryAction;
}

export async function processTransactionPipeline(
  tx: FailedTransaction,
  currentDateStr?: string
): Promise<PipelineTrace> {
  const steps: PipelineStep[] = [];
  const start = new Date().toISOString();

  // 1. CLASSIFY
  const classification = classifyFailure(tx);
  steps.push({
    stage: 'classify',
    payload: classification,
    timestamp: new Date().toISOString()
  });

  await saveClassification({
    transaction_id: tx.id,
    predicted_cause: classification.cause === 'low_balance' ? 'insufficient_balance' :
                     classification.cause === 'bank_offline' ? 'bank_downtime' :
                     classification.cause === 'mandate_expired' ? 'mandate_expired' :
                     classification.cause === 'limit_exceeded' ? 'limit_exceeded' : 'unknown',
    confidence: classification.confidence,
    reasoning_text: classification.reasoning,
    method: 'rule'
  });

  // 2. DECIDE
  const decision = decideRecovery(classification.cause, tx);
  steps.push({
    stage: 'decide',
    payload: decision,
    timestamp: new Date().toISOString()
  });

  await saveDecision({
    transaction_id: tx.id,
    chosen_action: decision.action === 'schedule_split' ? 'retry' : 
                   decision.action === 'voice' ? 'nudge' : decision.action,
    reasoning_text: decision.reasoning
  });

  // 3. GUARDRAILS
  const guardrailCheck = await contactAllowed(tx, decision.action, currentDateStr);
  steps.push({
    stage: 'guardrail',
    payload: guardrailCheck,
    timestamp: new Date().toISOString()
  });

  await saveGuardrailCheck({
    transaction_id: tx.id,
    check_name: decision.action === 'retry' ? 'retry_cap' : 'quiet_hours',
    passed: guardrailCheck.allowed,
    detail: guardrailCheck.reason
  });

  // 4. EXECUTE (Simulation)
  let outcome: Outcome = 'pending';
  let finalAction: RecoveryAction = decision.action;

  if (!guardrailCheck.allowed) {
    outcome = 'stopped';
    finalAction = 'stop';
  } else {
    // Probabilistic simulation based on cause and action
    const rand = Math.random();
    switch (classification.cause) {
      case 'low_balance':
        if (decision.action === 'nudge' && rand < 0.65) outcome = 'recovered';
        else if (decision.action === 'retry' && rand < 0.55) outcome = 'recovered';
        break;
      case 'bank_offline':
        if (rand < 0.85) outcome = 'recovered';
        break;
      case 'mandate_expired':
      case 'mandate_revoked':
        if (rand < 0.40) outcome = 'recovered';
        break;
      case 'limit_exceeded':
        if (rand < 0.50) outcome = 'recovered';
        break;
      case 'wrong_debit_date':
        if (rand < 0.70) outcome = 'recovered';
        break;
      case 'ambiguous':
        if (rand < 0.45) outcome = 'recovered';
        break;
      default:
        outcome = 'pending';
        break;
    }
  }

  steps.push({
    stage: 'execute',
    payload: { outcome, finalAction },
    timestamp: new Date().toISOString()
  });

  await saveExecution({
    transaction_id: tx.id,
    action_taken: finalAction,
    outcome: outcome === 'recovered' ? 'recovered' : outcome === 'stopped' ? 'stopped' : 'pending',
    amount_recovered: outcome === 'recovered' ? tx.amount : 0,
    executed_at: new Date().toISOString()
  });

  // Post to Recovery Ledger if recovered successfully
  if (outcome === 'recovered') {
    const channel = finalAction === 'nudge' ? 'sms' : 
                    finalAction === 'retry' ? 'auto_retry' : 
                    finalAction === 'reauth' ? 'web_reauth' : 'unknown';
    await postRecovery({
      transactionId: tx.id,
      amount: tx.amount,
      rootCause: classification.cause,
      recoveryActionUsed: finalAction,
      channel,
      timestamp: new Date().toISOString(),
      confidence: classification.confidence
    });
  }

  // Save audit log trace
  await saveAuditLog({
    transaction_id: tx.id,
    stage: 'execute',
    payload: { status: outcome, steps },
    created_at: new Date().toISOString()
  });

  return {
    transaction: tx,
    steps,
    outcome,
    recoveryActionUsed: finalAction
  };
}
