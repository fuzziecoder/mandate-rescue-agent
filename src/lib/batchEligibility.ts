import { getTransactions, getExecutions, getLedgerEntries, getTransactionById } from './db';

export interface RecoveryStatusResult {
  status: 'unprocessed' | 'pending' | 'recovered' | 'stopped' | 'failed';
  reason: string;
  ledgerEntryExists: boolean;
}

export interface BatchEligibilityResult {
  eligible: boolean;
  reason: string;
}

/**
 * Evaluates the current persisted recovery status of a single transaction.
 */
export async function getTransactionRecoveryStatus(transactionId: string): Promise<RecoveryStatusResult> {
  const ledgerEntries = await getLedgerEntries();
  const ledgerEntry = ledgerEntries.find(
    e => e.transaction_id === transactionId || e.idempotency_key === `recovery:${transactionId}`
  );

  if (ledgerEntry) {
    return {
      status: 'recovered',
      reason: 'Already posted to Recovery Ledger.',
      ledgerEntryExists: true,
    };
  }

  const executions = await getExecutions();
  const txExecs = executions.filter(e => e.transaction_id === transactionId);
  const latestExec = txExecs[txExecs.length - 1] || null;

  if (latestExec) {
    if (latestExec.outcome === 'recovered') {
      return {
        status: 'recovered',
        reason: 'Latest execution outcome is Recovered.',
        ledgerEntryExists: false,
      };
    }
    if (latestExec.outcome === 'stopped') {
      return {
        status: 'stopped',
        reason: 'Latest execution outcome is Stopped by guardrails or policy.',
        ledgerEntryExists: false,
      };
    }
    if (latestExec.outcome === 'still_failed' || (latestExec.outcome as string) === 'failed') {
      if (txExecs.length >= 3) {
        return {
          status: 'failed',
          reason: 'Terminally failed after maximum retry attempts exhausted.',
          ledgerEntryExists: false,
        };
      }
    }
  }

  const tx = await getTransactionById(transactionId);
  if (!tx) {
    return {
      status: 'failed',
      reason: 'Transaction not found in database.',
      ledgerEntryExists: false,
    };
  }

  if (latestExec && (latestExec.outcome === 'pending' || latestExec.outcome === 'still_failed')) {
    return {
      status: 'pending',
      reason: 'Transaction recovery is pending further action.',
      ledgerEntryExists: false,
    };
  }

  return {
    status: 'unprocessed',
    reason: 'Transaction is unprocessed and ready for recovery pipeline.',
    ledgerEntryExists: false,
  };
}

/**
 * Determines whether a transaction is eligible for inclusion in an automatic recovery batch.
 */
export async function isEligibleForBatch(transactionId: string): Promise<BatchEligibilityResult> {
  const statusRes = await getTransactionRecoveryStatus(transactionId);

  if (statusRes.ledgerEntryExists || statusRes.status === 'recovered') {
    return {
      eligible: false,
      reason: 'Already posted to Recovery Ledger.',
    };
  }

  if (statusRes.status === 'stopped') {
    return {
      eligible: false,
      reason: 'Transaction is stopped (interventions halted by guardrails or policy).',
    };
  }

  if (statusRes.status === 'failed') {
    return {
      eligible: false,
      reason: 'Transaction is terminally failed.',
    };
  }

  if (statusRes.status === 'unprocessed' || statusRes.status === 'pending') {
    return {
      eligible: true,
      reason: 'Eligible for recovery batch processing.',
    };
  }

  return {
    eligible: false,
    reason: statusRes.reason || 'Not eligible for batch execution.',
  };
}
