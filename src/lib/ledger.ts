import { getLedgerEntries, saveLedgerEntry, getTransactions, getPipelineTrace } from './db';
import { LedgerEntry } from './types';

export async function postRecovery(entry: LedgerEntry): Promise<{ inserted: boolean, duplicate: boolean, entry?: any, idempotencyKey: string }> {
  const existingEntries = await getLedgerEntries();
  const existingEntry = existingEntries.find(e => e.transaction_id === entry.transactionId);
  const idempotencyKey = `recovery:${entry.transactionId}`;

  if (existingEntry) {
    return { inserted: false, duplicate: true, entry: existingEntry, idempotencyKey };
  }

  const newEntry = {
    id: `LDG-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
    transaction_id: entry.transactionId,
    amount: entry.amount,
    root_cause: entry.rootCause,
    recovery_action_used: entry.recoveryActionUsed,
    channel: entry.channel,
    timestamp: entry.timestamp || new Date().toISOString(),
    confidence: entry.confidence
  };

  await saveLedgerEntry(newEntry);
  return { inserted: true, duplicate: false, entry: newEntry, idempotencyKey };
}

export async function getAllEntries(): Promise<LedgerEntry[]> {
  const dbEntries = await getLedgerEntries();
  return dbEntries.map(e => ({
    transactionId: e.transaction_id,
    amount: e.amount,
    rootCause: e.root_cause,
    recoveryActionUsed: e.recovery_action_used,
    channel: e.channel,
    timestamp: e.timestamp,
    confidence: e.confidence
  }));
}

export async function getSummary(): Promise<{
  totalRecovered: number;
  atRisk: number;
  net: number;
  byCategory: { [cat: string]: number };
}> {
  const entries = await getAllEntries();
  const txs = await getTransactions();

  const totalRecovered = entries.reduce((sum, e) => sum + e.amount, 0);
  const atRisk = txs.reduce((sum, t) => sum + t.amount, 0);
  const net = atRisk > 0 ? (totalRecovered / atRisk) * 100 : 0;

  const byCategory: { [cat: string]: number } = {};
  for (const e of entries) {
    byCategory[e.rootCause] = (byCategory[e.rootCause] || 0) + e.amount;
  }

  return {
    totalRecovered,
    atRisk,
    net,
    byCategory
  };
}

export async function reconcile(): Promise<boolean> {
  const entries = await getAllEntries();
  const summary = await getSummary();
  const calculatedSum = entries.reduce((sum, e) => sum + e.amount, 0);
  return Math.abs(calculatedSum - summary.totalRecovered) < 0.01;
}

export async function getLedgerReconciliation(): Promise<{
  ledgerRows: number;
  uniqueTransactionIds: number;
  duplicateTransactionIds: string[];
  recoveredTotal: number;
  isBalanced: boolean;
}> {
  const entries = await getLedgerEntries();
  const txs = await getTransactions();
  
  let recoveredTotalFromExecutions = 0;
  for (const tx of txs) {
    const trace = await getPipelineTrace(tx.id);
    if (trace?.execution?.outcome === 'recovered') {
      recoveredTotalFromExecutions += trace.execution.amount_recovered;
    }
  }

  const ids = entries.map(e => e.transaction_id);
  const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
  const uniqueIds = new Set(ids);
  
  const recoveredTotal = entries.reduce((sum, e) => sum + e.amount, 0);

  const isBalanced = duplicates.length === 0 && Math.abs(recoveredTotal - recoveredTotalFromExecutions) < 0.01;

  return {
    ledgerRows: entries.length,
    uniqueTransactionIds: uniqueIds.size,
    duplicateTransactionIds: [...new Set(duplicates)],
    recoveredTotal,
    isBalanced
  };
}
