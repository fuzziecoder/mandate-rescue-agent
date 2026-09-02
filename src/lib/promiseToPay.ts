import { getPromiseRecords, savePromiseRecord, PromiseRecord } from './db';
import { postRecovery } from './ledger';
import { getPipelineTrace } from './db';

export async function recordPromise(promise: PromiseRecord): Promise<void> {
  await savePromiseRecord({
    ...promise,
    status: 'pending',
    created_at: new Date().toISOString()
  });
}

export async function markKept(txnId: string): Promise<void> {
  const records = await getPromiseRecords();
  const p = records.find(r => r.transaction_id === txnId && r.status === 'pending');
  if (p) {
    p.status = 'kept';
    await savePromiseRecord(p);

    // Also post recovery to the immutable Ledger automatically
    const trace = await getPipelineTrace(txnId);
    await postRecovery({
      transactionId: txnId,
      amount: p.amount,
      rootCause: trace?.classification?.predicted_cause || 'unknown',
      recoveryActionUsed: trace?.decision?.chosen_action || 'nudge',
      channel: p.source.toLowerCase(),
      confidence: trace?.classification?.confidence || 1.0,
      timestamp: new Date().toISOString()
    });
  }
}

export async function markBroken(txnId: string): Promise<void> {
  const records = await getPromiseRecords();
  const p = records.find(r => r.transaction_id === txnId && r.status === 'pending');
  if (p) {
    p.status = 'broken';
    await savePromiseRecord(p);
  }
}

export async function listDue(): Promise<PromiseRecord[]> {
  const records = await getPromiseRecords();
  const now = new Date();
  return records.filter(r => r.status === 'pending' && new Date(r.promised_date) < now);
}
