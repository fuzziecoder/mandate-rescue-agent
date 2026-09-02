import { NextResponse } from 'next/server';
import {
  getTransactions,
  getClassifications,
  getDecisions,
  getGuardrailChecks,
  getExecutions,
  getAuditLogs,
  getLedgerEntries,
} from '@/lib/db';
import { getAllNormalizedTransactions } from '@/lib/normalizers';

export async function GET() {
  try {
    const [
      txs,
      classifications,
      decisions,
      guardrailChecks,
      executions,
      auditLogs,
      ledgerEntries,
      normalized,
    ] = await Promise.all([
      getTransactions(),
      getClassifications(),
      getDecisions(),
      getGuardrailChecks(),
      getExecutions(),
      getAuditLogs(),
      getLedgerEntries(),
      getAllNormalizedTransactions(),
    ]);

    const totalTransactions = txs.length;
    const totalAtRisk = txs.reduce((sum, t) => sum + t.amount, 0);
    const totalRecovered = ledgerEntries.reduce((sum, l) => sum + l.amount, 0);
    const recoveryRate = totalAtRisk > 0 ? (totalRecovered / totalAtRisk) * 100 : 0;

    const recoveredCount = ledgerEntries.length;
    const stoppedCount = executions.filter(e => e.outcome === 'stopped').length;
    const failedCount = executions.filter(e => e.outcome === 'still_failed').length;
    const pendingCount = Math.max(0, totalTransactions - (recoveredCount + stoppedCount + failedCount));

    const totalClassified = classifications.length;
    const totalDecided = decisions.length;
    const totalGuardrailChecked = guardrailChecks.length;
    const totalExecuted = executions.length;
    const totalAuditLogs = auditLogs.length;
    const totalLedgerEntries = ledgerEntries.length;

    // Group by failure cause
    const causeMap: { [cause: string]: { count: number; amountAtRisk: number; recoveredAmount: number; recoveredCount: number } } = {};
    for (const item of normalized) {
      const cause = item.failure_cause || 'unclassified';
      if (!causeMap[cause]) {
        causeMap[cause] = { count: 0, amountAtRisk: 0, recoveredAmount: 0, recoveredCount: 0 };
      }
      causeMap[cause].count++;
      causeMap[cause].amountAtRisk += item.amount;
      if (item.outcome === 'Recovered') {
        causeMap[cause].recoveredCount++;
        causeMap[cause].recoveredAmount += item.recovered_amount;
      }
    }

    const byFailureCause = Object.entries(causeMap).map(([cause, data]) => ({
      cause,
      count: data.count,
      amountAtRisk: data.amountAtRisk,
      recoveredAmount: data.recoveredAmount,
      recoveryRate: data.amountAtRisk > 0 ? (data.recoveredAmount / data.amountAtRisk) * 100 : 0,
      recoveredCount: data.recoveredCount,
    }));

    const funnel = {
      detected: totalTransactions,
      classified: totalClassified,
      decided: totalDecided,
      guardrailChecked: totalGuardrailChecked,
      executed: totalExecuted,
      recovered: recoveredCount,
    };

    const recentActivity = auditLogs.slice(0, 10);

    return NextResponse.json({
      totalTransactions,
      totalAtRisk,
      totalRecovered,
      recoveryRate,
      recoveredCount,
      pendingCount,
      stoppedCount,
      failedCount,
      totalClassified,
      totalDecided,
      totalGuardrailChecked,
      totalExecuted,
      totalAuditLogs,
      totalLedgerEntries,
      byFailureCause,
      funnel,
      recentActivity,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
