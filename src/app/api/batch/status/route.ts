import { NextResponse } from 'next/server';
import { getBatchRunStatus } from '@/lib/batchEngine';
import { getTransactions } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    const batch = await getBatchRunStatus(id || undefined);
    const txs = await getTransactions();
    const totalCount = txs.length;

    if (!batch) {
      return NextResponse.json({
        id: null,
        status: 'idle',
        isRunning: false,
        total: totalCount,
        processed: 0,
        currentStage: 'idle',
        currentTxIndex: 0,
        progress: 0,
        metrics: { recovered: 0, failed: 0, stopped: 0, pending: totalCount, nudgesBlocked: 0 },
      });
    }

    const isRunning = batch.status === 'running';
    const progress = batch.total > 0 ? Math.round((batch.processed / batch.total) * 100) : 0;

    return NextResponse.json({
      id: batch.id,
      status: batch.status,
      isRunning,
      total: batch.total,
      processed: batch.processed,
      currentStage: isRunning ? 'execute' : 'idle',
      currentTxIndex: batch.processed,
      progress,
      totalAtRisk: batch.total_at_risk,
      totalRecovered: batch.total_recovered,
      metrics: {
        recovered: batch.recovered_count,
        failed: batch.failed_count,
        stopped: batch.stopped_count,
        pending: batch.pending_count,
        nudgesBlocked: batch.stopped_count,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
