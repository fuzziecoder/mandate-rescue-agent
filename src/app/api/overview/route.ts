import { NextResponse } from 'next/server';
import {
  getTransactions,
  getClassifications,
  getDecisions,
  getGuardrailChecks,
  getExecutions,
  getAuditLogs,
  getLedgerEntries,
  getLatestBatchRun,
} from '@/lib/db';
import { getAllNormalizedTransactions } from '@/lib/normalizers';
import {
  calculateTotalAtRisk,
  calculateRecoveredRevenue,
  calculateRecoveryRate,
  calculateOutcomeCounts,
  calculateFunnelCounts,
  calculateFailureCauseBreakdown,
  calculateLedgerReconciliation,
} from '@/lib/metrics';

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
      latestBatchRecord,
    ] = await Promise.all([
      getTransactions(),
      getClassifications(),
      getDecisions(),
      getGuardrailChecks(),
      getExecutions(),
      getAuditLogs(),
      getLedgerEntries(),
      getAllNormalizedTransactions(),
      getLatestBatchRun(),
    ]);

    const totalAtRisk = calculateTotalAtRisk(txs);
    const totalRecovered = calculateRecoveredRevenue(ledgerEntries);
    const recoveryRate = calculateRecoveryRate(totalRecovered, totalAtRisk);
    const outcomeCounts = calculateOutcomeCounts(executions, txs);
    const reconciliation = calculateLedgerReconciliation(ledgerEntries, txs);
    const funnel = calculateFunnelCounts(
      txs,
      classifications,
      decisions,
      guardrailChecks,
      executions,
      ledgerEntries
    );
    const byFailureCause = calculateFailureCauseBreakdown(normalized);

    const metrics = {
      totalTransactions: txs.length,
      totalAtRisk,
      totalRecovered,
      netAtRisk: reconciliation.netAtRisk,
      recoveryRate,
      recoveredCount: outcomeCounts.recoveredCount,
      pendingCount: outcomeCounts.pendingCount,
      stoppedCount: outcomeCounts.stoppedCount,
      failedCount: outcomeCounts.failedCount,
      ledgerBalanced: reconciliation.ledgerBalanced,
      duplicateLedgerTransactionIds: reconciliation.duplicateTransactionIds,
    };

    const latestBatch = latestBatchRecord
      ? {
          id: latestBatchRecord.id,
          status: latestBatchRecord.status,
          total: latestBatchRecord.total,
          processed: latestBatchRecord.processed,
          progressPercent:
            latestBatchRecord.total > 0
              ? Math.round((latestBatchRecord.processed / latestBatchRecord.total) * 100)
              : 0,
          totalAtRisk: latestBatchRecord.total_at_risk,
          totalRecovered: latestBatchRecord.total_recovered,
          recoveredCount: latestBatchRecord.recovered_count,
          stoppedCount: latestBatchRecord.stopped_count,
          pendingCount: latestBatchRecord.pending_count,
          failedCount: latestBatchRecord.failed_count,
        }
      : {
          id: null,
          status: null,
          total: 0,
          processed: 0,
          progressPercent: 0,
          totalAtRisk: 0,
          totalRecovered: 0,
          recoveredCount: 0,
          stoppedCount: 0,
          pendingCount: 0,
          failedCount: 0,
        };

    const recentAuditEvents = (auditLogs || []).slice(0, 15);

    const financialDataWarning = !reconciliation.ledgerBalanced
      ? 'Ledger reconciliation required before using recovery metrics.'
      : undefined;

    return NextResponse.json({
      metrics,
      funnel,
      latestBatch,
      byFailureCause,
      recentAuditEvents,
      dataSource: 'synthetic_json',
      ledgerBalanced: reconciliation.ledgerBalanced,
      duplicateLedgerTransactionIds: reconciliation.duplicateTransactionIds,
      financialDataWarning,
      // Legacy root compatibility fields
      totalTransactions: txs.length,
      totalAtRisk,
      totalRecovered,
      recoveryRate,
      recoveredCount: outcomeCounts.recoveredCount,
      pendingCount: outcomeCounts.pendingCount,
      stoppedCount: outcomeCounts.stoppedCount,
      failedCount: outcomeCounts.failedCount,
      totalClassified: classifications.length,
      totalDecided: decisions.length,
      totalGuardrailChecked: guardrailChecks.length,
      totalExecuted: executions.length,
      totalAuditLogs: auditLogs.length,
      totalLedgerEntries: ledgerEntries.length,
      recentActivity: recentAuditEvents,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
