import { NextResponse } from 'next/server';
import { getPipelineTrace, getLedgerEntries } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const trace = await getPipelineTrace(id);
    if (!trace) {
      return NextResponse.json({ success: false, message: 'Transaction not found' }, { status: 404 });
    }

    const ledgerEntries = await getLedgerEntries();
    const ledgerEntry = ledgerEntries.find(l => l.transaction_id === id) || null;

    let nudgeMessage: string | null = null;
    const executeLog = trace.auditLogs.find(log => log.stage === 'execute');
    if (executeLog && executeLog.payload?.nudge_message) {
      nudgeMessage = executeLog.payload.nudge_message;
    }

    return NextResponse.json({ 
      success: true, 
      trace: {
        ...trace,
        ledgerEntry,
        nudgeMessage
      }
    });
  } catch (error: any) {
    console.error(`Error fetching pipeline trace for ${id}:`, error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
