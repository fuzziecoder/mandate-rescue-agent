import { NextResponse } from 'next/server';
import { getBatchRunById } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const batch = await getBatchRunById(params.id);
    if (!batch) {
      return NextResponse.json({ error: `Batch ${params.id} not found` }, { status: 404 });
    }
    return NextResponse.json({
      ...batch,
      selected: batch.total_selected ?? batch.total,
      eligible: batch.total_eligible ?? batch.total,
      processed: batch.processed,
      skippedRecovered: batch.skipped_recovered ?? 0,
      skippedStopped: batch.skipped_stopped ?? 0,
      skippedFailed: batch.skipped_failed ?? 0,
      recoveredCount: batch.recovered_count,
      totalAtRisk: batch.total_at_risk,
      totalRecovered: batch.total_recovered,
      status: batch.status,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
