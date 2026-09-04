import { NextRequest, NextResponse } from 'next/server';
import { getBatchRunById } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const batchId = params.id;
    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    const batch = await getBatchRunById(batchId);
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const selectedCount = batch.total_eligible ?? batch.total ?? 0;
    const processedCount = batch.processed ?? 0;
    const progressPercent =
      selectedCount > 0 ? Math.round((processedCount / selectedCount) * 100) : 0;

    const snapshot = {
      batchId: batch.id,
      status: batch.status,
      processedCount,
      selectedCount,
      progressPercent,
      currentStage: batch.current_stage ?? 'idle',
      lastProcessedTransactionId: batch.last_processed_transaction_id ?? null,
      totalAtRisk: batch.total_at_risk ?? 0,
      totalRecovered: batch.total_recovered ?? 0,
      recoveryRate: batch.recovery_rate ?? 0,
      recoveredCount: batch.recovered_count ?? 0,
      failedCount: batch.failed_count ?? 0,
      stoppedCount: batch.stopped_count ?? 0,
      blockedCount: batch.blocked_count ?? 0,
      pendingCount: batch.pending_count ?? 0,
      recentEvents: batch.recent_events ?? [],
      updatedAt: batch.updated_at ?? batch.started_at,
      startedAt: batch.started_at,
      completedAt: batch.completed_at ?? null,
    };

    return NextResponse.json(snapshot, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
      },
    });
  } catch (err: any) {
    console.error('[/api/batch/[id]/live] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
