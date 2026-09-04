import { NextResponse } from 'next/server';
import { startBatchRun } from '@/lib/batchEngine';
import { getTransactions } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const txs = await getTransactions();
    if (!txs || txs.length === 0) {
      return NextResponse.json(
        { error: 'No transactions available. Run the generator first.' },
        { status: 400 }
      );
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch (_) {}

    const result = await startBatchRun({
      source: body.source || 'dashboard',
      transactionIds: body.transactionIds || 'all',
      delayMs: body.delayMs,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
