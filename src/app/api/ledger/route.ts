import { NextResponse } from 'next/server';
import { getLedgerEntries, getTransactions, getExecutions } from '@/lib/db';
import { getLedgerReconciliation } from '@/lib/ledger';

export async function GET() {
  try {
    const [entries, txs, executions, reconciliation] = await Promise.all([
      getLedgerEntries(),
      getTransactions(),
      getExecutions(),
      getLedgerReconciliation(),
    ]);

    const totalAtRisk = txs.reduce((sum, t) => sum + t.amount, 0);
    const totalRecovered = entries.reduce((sum, e) => sum + e.amount, 0);
    const netAtRisk = Math.max(0, totalAtRisk - totalRecovered);
    const recoveredCount = entries.length;
    const openAtRiskCount = Math.max(0, txs.length - recoveredCount);
    const recoveryRate = totalAtRisk > 0 ? (totalRecovered / totalAtRisk) * 100 : 0;

    // Group by Cause
    const causeMap: { [key: string]: number } = {};
    const actionMap: { [key: string]: number } = {};

    for (const entry of entries) {
      causeMap[entry.root_cause] = (causeMap[entry.root_cause] || 0) + entry.amount;
      actionMap[entry.recovery_action_used] = (actionMap[entry.recovery_action_used] || 0) + entry.amount;
    }

    const byCause = Object.entries(causeMap).map(([cause, amount]) => ({
      cause,
      amount,
      percentage: totalRecovered > 0 ? (amount / totalRecovered) * 100 : 0,
    }));

    const byAction = Object.entries(actionMap).map(([action, amount]) => ({
      action,
      amount,
      percentage: totalRecovered > 0 ? (amount / totalRecovered) * 100 : 0,
    }));

    return NextResponse.json({
      entries,
      summary: {
        totalRecovered,
        totalAtRisk,
        netAtRisk,
        recoveredCount,
        openAtRiskCount,
        recoveryRate,
        ledgerBalanced: reconciliation.isBalanced,
        duplicateTransactionIds: reconciliation.duplicateTransactionIds,
      },
      byCause,
      byAction,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch ledger' }, { status: 500 });
  }
}
