import { NextResponse } from 'next/server';
import { getTransactions, getExecutions } from '@/lib/db';

export async function GET() {
  try {
    const [txs, executions] = await Promise.all([
      getTransactions(),
      getExecutions(),
    ]);

    const totalTransactions = txs.length;

    const transactionsByErrorCode: { [key: string]: number } = {};
    const transactionsByBank: { [key: string]: number } = {};
    const transactionsBySubscriptionType: { [key: string]: number } = {};

    let oldestFailureAt: string | null = null;
    let newestFailureAt: string | null = null;

    for (const tx of txs) {
      // Error code
      transactionsByErrorCode[tx.error_code] = (transactionsByErrorCode[tx.error_code] || 0) + 1;

      // Bank
      transactionsByBank[tx.bank_name] = (transactionsByBank[tx.bank_name] || 0) + 1;

      // Subscription type
      transactionsBySubscriptionType[tx.subscription_type] = (transactionsBySubscriptionType[tx.subscription_type] || 0) + 1;

      // Timestamps
      if (tx.failed_at) {
        if (!oldestFailureAt || new Date(tx.failed_at) < new Date(oldestFailureAt)) {
          oldestFailureAt = tx.failed_at;
        }
        if (!newestFailureAt || new Date(tx.failed_at) > new Date(newestFailureAt)) {
          newestFailureAt = tx.failed_at;
        }
      }
    }

    const processedRecords = executions.length;
    const status = processedRecords === totalTransactions && totalTransactions > 0
      ? 'Completed'
      : processedRecords > 0
      ? 'In Progress'
      : 'Ingested (Pending Execution)';

    const batches = [
      {
        batchId: 'SYNTHETIC_BATCH_001',
        createdAt: oldestFailureAt || new Date().toISOString(),
        totalRecords: totalTransactions,
        processedRecords,
        status,
        isSynthetic: true,
      },
    ];

    return NextResponse.json({
      totalTransactions,
      transactionsByErrorCode,
      transactionsByBank,
      transactionsBySubscriptionType,
      oldestFailureAt,
      newestFailureAt,
      batches,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
