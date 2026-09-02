import { NextResponse } from 'next/server';
import { getPromiseRecords } from '@/lib/db';

export async function GET() {
  try {
    const promises = await getPromiseRecords();
    const total = promises.length;
    const pending = promises.filter(p => p.status === 'pending').length;
    const kept = promises.filter(p => p.status === 'kept').length;
    const broken = promises.filter(p => p.status === 'broken').length;
    const recoveredFromPromises = promises
      .filter(p => p.status === 'kept')
      .reduce((sum, p) => sum + p.amount, 0);

    return NextResponse.json({
      summary: {
        total,
        pending,
        kept,
        broken,
        due: pending,
        recoveredFromPromises,
      },
      data: promises,
      emptyState: total === 0 ? 'No promise-to-pay commitments have been captured in this simulation batch yet.' : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
