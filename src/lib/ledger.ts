import { getLedgerEntries, saveLedgerEntryOnce, getTransactions } from './db';
import { LedgerEntry } from './types';

export interface PostRecoveryInput {
  transactionId?: string;
  transaction_id?: string;
  amount: number;
  currency?: string;
  rootCause?: string;
  root_cause?: string;
  failure_cause?: string;
  recoveryActionUsed?: string;
  recovery_action?: string;
  channel?: string;
  timestamp?: string;
  posted_at?: string;
  confidence?: number;
  providerEventId?: string;
  provider_event_id?: string;
  source?: string;
  idempotencyKey?: string;
  idempotency_key?: string;
}

export interface PostRecoveryResult {
  entry: any;
  inserted: boolean;
  duplicate: boolean;
  reason?: string;
  idempotencyKey?: string;
}

/**
 * Post recovery entry once to ledger with strict idempotency check.
 */
export async function postRecoveryOnce(input: PostRecoveryInput): Promise<PostRecoveryResult> {
  const txId = input.transactionId || input.transaction_id;
  if (!txId) {
    throw new Error('postRecoveryOnce requires a valid transactionId.');
  }

  const amt = Number(input.amount);
  if (isNaN(amt) || !isFinite(amt) || amt <= 0) {
    throw new Error(`postRecoveryOnce requires a positive finite amount. Got: ${input.amount}`);
  }

  const idempotencyKey = input.idempotencyKey || input.idempotency_key || `recovery:${txId}`;
  const rootCause = input.rootCause || input.root_cause || input.failure_cause || 'unknown';
  const recoveryAction = input.recoveryActionUsed || input.recovery_action || 'auto_retry';
  const timestamp = input.timestamp || input.posted_at || new Date().toISOString();

  const res = await saveLedgerEntryOnce({
    transaction_id: txId,
    idempotency_key: idempotencyKey,
    amount: amt,
    currency: input.currency || 'INR',
    root_cause: rootCause,
    failure_cause: rootCause,
    recovery_action_used: recoveryAction,
    recovery_action: recoveryAction,
    channel: input.channel || 'auto_retry',
    provider_event_id: input.providerEventId || input.provider_event_id || null,
    posted_at: timestamp,
    timestamp: timestamp,
    source: input.source || 'batch_engine',
    status: 'recovered',
    confidence: input.confidence ?? 0.95,
  });

  return {
    entry: res.entry,
    inserted: res.inserted,
    duplicate: res.duplicate,
    reason: res.reason,
    idempotencyKey,
  };
}

/**
 * Legacy postRecovery function — delegates to postRecoveryOnce for backwards compatibility.
 */
export async function postRecovery(entry: LedgerEntry | any): Promise<{ inserted: boolean; duplicate: boolean; entry?: any; idempotencyKey: string }> {
  const result = await postRecoveryOnce(entry);
  return {
    inserted: result.inserted,
    duplicate: result.duplicate,
    entry: result.entry,
    idempotencyKey: result.idempotencyKey || `recovery:${entry.transactionId || entry.transaction_id}`,
  };
}

export async function getAllEntries(): Promise<LedgerEntry[]> {
  const dbEntries = await getLedgerEntries();
  return dbEntries.map(e => ({
    transactionId: e.transaction_id,
    amount: e.amount,
    rootCause: e.root_cause || e.failure_cause || 'unknown',
    recoveryActionUsed: e.recovery_action_used || e.recovery_action || 'auto_retry',
    channel: e.channel || 'auto_retry',
    timestamp: e.timestamp || e.posted_at || '',
    confidence: e.confidence ?? 0.95,
  }));
}

export async function getSummary(): Promise<{
  totalRecovered: number;
  atRisk: number;
  net: number;
  byCategory: { [cat: string]: number };
}> {
  const entries = await getLedgerEntries();
  const txs = await getTransactions();

  const seenTxIds = new Set<string>();
  let totalRecovered = 0;
  for (const e of entries) {
    if (!seenTxIds.has(e.transaction_id)) {
      seenTxIds.add(e.transaction_id);
      totalRecovered += e.amount;
    }
  }

  const atRisk = txs.reduce((sum, t) => sum + t.amount, 0);
  const net = atRisk > 0 ? (totalRecovered / atRisk) * 100 : 0;

  const byCategory: { [cat: string]: number } = {};
  for (const e of entries) {
    const cause = e.root_cause || e.failure_cause || 'unknown';
    byCategory[cause] = (byCategory[cause] || 0) + e.amount;
  }

  return {
    totalRecovered,
    atRisk,
    net,
    byCategory,
  };
}

export async function reconcile(): Promise<boolean> {
  const recon = await getLedgerReconciliation();
  return recon.isBalanced;
}

export async function getLedgerReconciliation(): Promise<{
  totalRows: number;
  uniqueTransactionCount: number;
  duplicateTransactionIds: string[];
  duplicateIdempotencyKeys: string[];
  totalRecovered: number;
  isBalanced: boolean;
}> {
  const entries = await getLedgerEntries();

  const txIds = entries.map(e => e.transaction_id);
  const keys = entries.map(e => e.idempotency_key || `recovery:${e.transaction_id}`);

  const dupTxIds = Array.from(new Set(txIds.filter((id, i) => txIds.indexOf(id) !== i)));
  const dupKeys = Array.from(new Set(keys.filter((k, i) => keys.indexOf(k) !== i)));

  const uniqueTxIds = new Set(txIds);

  const totalRecovered = entries.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const isBalanced = dupTxIds.length === 0 && dupKeys.length === 0;

  return {
    totalRows: entries.length,
    uniqueTransactionCount: uniqueTxIds.size,
    duplicateTransactionIds: dupTxIds,
    duplicateIdempotencyKeys: dupKeys,
    totalRecovered,
    isBalanced,
  };
}
