import { Transaction, Classification, Decision, GuardrailCheck, Execution, AuditLog, LedgerEntry } from './db';

export interface OutcomeCounts {
  recoveredCount: number;
  pendingCount: number;
  stoppedCount: number;
  failedCount: number;
}

export interface FunnelCounts {
  detected: number;
  classified: number;
  decided: number;
  guardrailChecked: number;
  executed: number;
  recovered: number;
}

export interface FailureCauseBreakdownItem {
  cause: string;
  count: number;
  amountAtRisk: number;
  recoveredAmount: number;
  recoveryRate: number;
  recoveredCount: number;
}

export interface LedgerReconciliation {
  totalRecovered: number;
  recoveredCount: number;
  totalAtRisk: number;
  netAtRisk: number;
  recoveryRate: number;
  ledgerBalanced: boolean;
  duplicateTransactionIds: string[];
}

/**
 * Total at risk = sum of raw transactions[].amount
 */
export function calculateTotalAtRisk(transactions: Transaction[]): number {
  if (!transactions || transactions.length === 0) return 0;
  return transactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
}

/**
 * Total recovered = sum only of unique successful ledger[].amount
 */
export function calculateRecoveredRevenue(ledger: LedgerEntry[]): number {
  if (!ledger || ledger.length === 0) return 0;
  const seenTxIds = new Set<string>();
  let total = 0;
  for (const entry of ledger) {
    if (!seenTxIds.has(entry.transaction_id)) {
      seenTxIds.add(entry.transaction_id);
      total += Number(entry.amount) || 0;
    }
  }
  return total;
}

/**
 * Recovery rate = totalRecovered / totalAtRisk * 100
 */
export function calculateRecoveryRate(totalRecovered: number, totalAtRisk: number): number {
  if (!totalAtRisk || totalAtRisk <= 0) return 0;
  const rate = (totalRecovered / totalAtRisk) * 100;
  return Math.min(100, Math.max(0, rate));
}

/**
 * Outcome counts based on execution outcomes and total transactions
 */
export function calculateOutcomeCounts(executions: Execution[], transactions: Transaction[]): OutcomeCounts {
  const total = transactions ? transactions.length : 0;
  if (!executions || executions.length === 0) {
    return {
      recoveredCount: 0,
      pendingCount: total,
      stoppedCount: 0,
      failedCount: 0,
    };
  }

  // Count latest execution per transaction
  const latestExecMap = new Map<string, Execution>();
  for (const exec of executions) {
    if (exec.transaction_id) {
      latestExecMap.set(exec.transaction_id, exec);
    }
  }

  let recoveredCount = 0;
  let stoppedCount = 0;
  let failedCount = 0;

  for (const exec of Array.from(latestExecMap.values())) {
    if (exec.outcome === 'recovered') {
      recoveredCount++;
    } else if (exec.outcome === 'stopped') {
      stoppedCount++;
    } else if (exec.outcome === 'still_failed') {
      failedCount++;
    }
  }

  const processedCount = recoveredCount + stoppedCount + failedCount;
  const pendingCount = Math.max(0, total - processedCount);

  return {
    recoveredCount,
    pendingCount,
    stoppedCount,
    failedCount,
  };
}

/**
 * Funnel stage counts
 */
export function calculateFunnelCounts(
  transactions: Transaction[],
  classifications: Classification[],
  decisions: Decision[],
  guardrails: GuardrailCheck[],
  executions: Execution[],
  ledger: LedgerEntry[]
): FunnelCounts {
  const uniqueClassified = new Set((classifications || []).map(c => c.transaction_id)).size;
  const uniqueDecided = new Set((decisions || []).map(d => d.transaction_id)).size;
  const uniqueGuardrails = new Set((guardrails || []).map(g => g.transaction_id)).size;
  const uniqueExecuted = new Set((executions || []).map(e => e.transaction_id)).size;
  const uniqueRecovered = new Set((ledger || []).map(l => l.transaction_id)).size;

  return {
    detected: transactions ? transactions.length : 0,
    classified: uniqueClassified,
    decided: uniqueDecided,
    guardrailChecked: uniqueGuardrails,
    executed: uniqueExecuted,
    recovered: uniqueRecovered,
  };
}

/**
 * Breakdown by failure cause
 */
export function calculateFailureCauseBreakdown(normalized: any[]): FailureCauseBreakdownItem[] {
  if (!normalized || normalized.length === 0) return [];

  const causeMap: { [cause: string]: { count: number; amountAtRisk: number; recoveredAmount: number; recoveredCount: number } } = {};
  for (const item of normalized) {
    const cause = item.failure_cause || item.cause || 'unclassified';
    if (!causeMap[cause]) {
      causeMap[cause] = { count: 0, amountAtRisk: 0, recoveredAmount: 0, recoveredCount: 0 };
    }
    causeMap[cause].count++;
    causeMap[cause].amountAtRisk += item.amount || 0;
    if (item.outcome === 'Recovered' || item.outcome === 'recovered') {
      causeMap[cause].recoveredCount++;
      causeMap[cause].recoveredAmount += item.recovered_amount || item.amount || 0;
    }
  }

  return Object.entries(causeMap).map(([cause, data]) => ({
    cause,
    count: data.count,
    amountAtRisk: data.amountAtRisk,
    recoveredAmount: data.recoveredAmount,
    recoveryRate: data.amountAtRisk > 0 ? (data.recoveredAmount / data.amountAtRisk) * 100 : 0,
    recoveredCount: data.recoveredCount,
  }));
}

/**
 * Check duplicate ledger transaction IDs and return summary reconciliation status
 */
export function calculateLedgerReconciliation(ledger: LedgerEntry[], transactions: Transaction[]): LedgerReconciliation {
  const totalAtRisk = calculateTotalAtRisk(transactions);
  const ledgerEntries = ledger || [];
  const txIds = ledgerEntries.map(e => e.transaction_id);
  const duplicates = txIds.filter((id, i) => txIds.indexOf(id) !== i);
  const uniqueDuplicates = Array.from(new Set(duplicates));
  const uniqueTxIds = new Set(txIds);

  const totalRecovered = calculateRecoveredRevenue(ledgerEntries);
  const netAtRisk = Math.max(0, totalAtRisk - totalRecovered);
  const recoveryRate = calculateRecoveryRate(totalRecovered, totalAtRisk);
  const ledgerBalanced = uniqueDuplicates.length === 0;

  return {
    totalRecovered,
    recoveredCount: uniqueTxIds.size,
    totalAtRisk,
    netAtRisk,
    recoveryRate,
    ledgerBalanced,
    duplicateTransactionIds: uniqueDuplicates,
  };
}
