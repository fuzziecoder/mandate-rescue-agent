import { NextResponse } from 'next/server';
import { getLedgerEntries, getTransactions } from '@/lib/db';
import { calculateLedgerReconciliation } from '@/lib/metrics';

export async function GET() {
  try {
    const [entries, txs] = await Promise.all([
      getLedgerEntries(),
      getTransactions(),
    ]);

    const summary = calculateLedgerReconciliation(entries, txs);

    return NextResponse.json({
      entries: entries || [],
      summary,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
