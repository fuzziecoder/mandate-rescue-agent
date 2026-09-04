import {
  Transaction,
  Classification,
  Decision,
  GuardrailCheck,
  Execution,
  AuditLog,
  LedgerEntry,
  getTransactions,
  getClassifications,
  getDecisions,
  getGuardrailChecks,
  getExecutions,
  getAuditLogs,
  getLedgerEntries,
} from './db';
import { classifyRuleBased } from './classifier';

export interface TransactionView {
  id: string;
  customer_id: string;
  amount: number;
  currency: string;
  mandate_id: string;
  bank_name: string;
  error_code: string;
  error_message: string;
  failed_at: string;
  subscription_type: string;
  customer_payment_history: {
    past_success_rate: number;
    avg_balance_pattern: string;
    payment_timing: string;
    opt_out: boolean;
    recent_nudges_count: number;
    past_retry_attempts: number;
  };
  failure_cause: string | null;
  classifier: string | null;
  confidence: number | null;
  action_chosen: string | null;
  decision_reason: string | null;
  scheduled_for: string | null;
  guardrail_allowed: boolean | null;
  guardrail_reason: string | null;
  outcome: 'Recovered' | 'Pending' | 'Failed' | 'Stopped' | 'Not Processed';
  recovered_amount: number;
  audit_steps: unknown[];
  ledger_entry_id: string | null;
}

export function normalizeTransactionView(
  tx: Transaction,
  classifications: Classification[] = [],
  decisions: Decision[] = [],
  guardrailChecks: GuardrailCheck[] = [],
  executions: Execution[] = [],
  auditLogs: AuditLog[] = [],
  ledgerEntries: LedgerEntry[] = []
): TransactionView {
  const cls = classifications.find(c => c.transaction_id === tx.id);
  const dec = decisions.find(d => d.transaction_id === tx.id);
  const gdChecks = guardrailChecks.filter(g => g.transaction_id === tx.id);
  const exec = executions.find(e => e.transaction_id === tx.id);
  const audit = auditLogs.find(a => a.transaction_id === tx.id);
  const ledger = ledgerEntries.find(l => l.transaction_id === tx.id);

  let mappedOutcome: 'Recovered' | 'Pending' | 'Failed' | 'Stopped' | 'Not Processed' = 'Not Processed';
  if (exec) {
    if (exec.outcome === 'recovered') mappedOutcome = 'Recovered';
    else if (exec.outcome === 'still_failed') mappedOutcome = 'Failed';
    else if (exec.outcome === 'stopped') mappedOutcome = 'Stopped';
    else mappedOutcome = 'Pending';
  } else if (cls || dec) {
    mappedOutcome = 'Pending';
  }

  const guardrailAllowed = gdChecks.length > 0 ? gdChecks.every(g => g.passed) : null;
  const guardrailReason = gdChecks.map(g => g.detail).join('; ') || null;

  return {
    id: tx.id,
    customer_id: tx.customer_id,
    amount: tx.amount,
    currency: tx.currency || 'INR',
    mandate_id: tx.mandate_id,
    bank_name: tx.bank_name,
    error_code: tx.error_code,
    error_message: tx.error_message,
    failed_at: tx.failed_at,
    subscription_type: tx.subscription_type,
    customer_payment_history: {
      past_success_rate: tx.customer_payment_history?.past_success_rate ?? 0,
      avg_balance_pattern: tx.customer_payment_history?.avg_balance_pattern ?? 'normal',
      payment_timing: tx.customer_payment_history?.payment_timing ?? 'on_time',
      opt_out: tx.customer_payment_history?.opt_out ?? false,
      recent_nudges_count: tx.customer_payment_history?.recent_nudges_count ?? 0,
      past_retry_attempts: tx.customer_payment_history?.past_retry_attempts ?? 0,
    },
    failure_cause: cls?.predicted_cause || classifyRuleBased(tx.error_code || '', tx.error_message || '')?.cause || 'unclassified',
    classifier: cls?.method || null,
    confidence: cls?.confidence ?? null,
    action_chosen: dec?.chosen_action || null,
    decision_reason: dec?.reasoning_text || null,
    scheduled_for: null,
    guardrail_allowed: guardrailAllowed,
    guardrail_reason: guardrailReason,
    outcome: mappedOutcome,
    recovered_amount: ledger ? ledger.amount : (exec?.outcome === 'recovered' ? (exec.amount_recovered ?? 0) : 0),
    audit_steps: audit?.payload?.steps || [],
    ledger_entry_id: ledger?.id || null,
  };
}

export async function getAllNormalizedTransactions(): Promise<TransactionView[]> {
  const [
    txs,
    classifications,
    decisions,
    guardrailChecks,
    executions,
    auditLogs,
    ledgerEntries,
  ] = await Promise.all([
    getTransactions(),
    getClassifications(),
    getDecisions(),
    getGuardrailChecks(),
    getExecutions(),
    getAuditLogs(),
    getLedgerEntries(),
  ]);

  return txs.map(tx =>
    normalizeTransactionView(
      tx,
      classifications,
      decisions,
      guardrailChecks,
      executions,
      auditLogs,
      ledgerEntries
    )
  );
}
