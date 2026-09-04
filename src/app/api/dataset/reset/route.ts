import { NextResponse } from 'next/server';
import { resetAndGenerateFreshDataset } from '@/lib/synthetic/resetDataset';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: Request) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      // Body is optional
    }

    const { transactionCount = 300, seed = null, preserveSettings = true } = body;

    // The core function also enforces these checks, but doing it here prevents loading imports if disabled
    if (process.env.WEBHOOK_SIMULATION_MODE !== 'true') {
      return NextResponse.json(
        { error: 'Synthetic reset is disabled outside local simulation mode.' },
        { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }
    
    if (process.env.ALLOW_SYNTHETIC_DATA_RESET !== 'true') {
      return NextResponse.json(
        { error: 'Synthetic reset is disabled. Check ALLOW_SYNTHETIC_DATA_RESET.' },
        { status: 403, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const result = await resetAndGenerateFreshDataset({
      transactionCount: parseInt(transactionCount, 10),
      seed: seed ? parseInt(seed, 10) : undefined,
      preserveSettings: Boolean(preserveSettings),
      requestedBy: 'dashboard'
    });

    return NextResponse.json({
      ok: true,
      message: 'Fresh synthetic dataset generated. Previous data was backed up.',
      dataset: {
        datasetId: result.datasetId,
        transactionCount: result.count,
        totalAtRisk: result.totalAtRisk,
        generatedAt: result.generatedAt,
        seed: result.seed,
        causeDistribution: result.causeDistribution
      },
      backupPath: result.backupPath
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    });

  } catch (err: any) {
    console.error('[API] Reset Dataset Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to reset dataset' },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
