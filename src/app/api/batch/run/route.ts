import { NextResponse } from 'next/server';
import { startBatchRun, getBatchRunStatus } from '@/lib/batchEngine';
import { getTransactions } from '@/lib/db';

export async function GET() {
  try {
    const latest = await getBatchRunStatus();
    const txs = await getTransactions();
    const totalCount = txs.length;

    if (!latest) {
      return NextResponse.json({
        success: true,
        status: 'idle',
        progress: 0,
        totalCount,
        processedCount: 0,
        metrics: { recovered: 0, failed: 0, stopped: 0, nudgesBlocked: 0 },
      });
    }

    return NextResponse.json({
      success: true,
      batchId: latest.id,
      status: latest.status,
      progress: latest.total > 0 ? Math.round((latest.processed / latest.total) * 100) : 0,
      totalCount: latest.total,
      processedCount: latest.processed,
      metrics: {
        recovered: latest.recovered_count,
        failed: latest.failed_count,
        stopped: latest.stopped_count,
        pending: latest.pending_count,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch (_) {}

    const result = await startBatchRun({
      source: body.source || 'dashboard',
      transactionIds: body.transactionIds || 'all',
    });

    return NextResponse.json({
      success: true,
      message: 'Batch recovery pipeline started.',
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
