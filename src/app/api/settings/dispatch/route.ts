import { NextResponse } from 'next/server';
import { getSettings, updateSettings, getLatestBatchRun, updateBatchRun, appendAuditLog } from '@/lib/db';

export async function GET() {
  try {
    const settings = await getSettings();
    const latestBatch = await getLatestBatchRun();

    return NextResponse.json({
      dispatchKillSwitch: settings.dispatch_kill_switch,
      updatedAt: settings.updated_at,
      updatedBy: settings.updated_by,
      activeBatchId: latestBatch ? latestBatch.id : null,
      activeBatchStatus: latestBatch ? latestBatch.status : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.dispatchKillSwitch !== 'boolean') {
      return NextResponse.json(
        { error: 'dispatchKillSwitch boolean field is required' },
        { status: 400 }
      );
    }

    const killSwitch = body.dispatchKillSwitch;
    const updatedSettings = await updateSettings({
      dispatch_kill_switch: killSwitch,
      updated_at: new Date().toISOString(),
      updated_by: body.updatedBy || 'dashboard',
    });

    const event_type = killSwitch ? 'dispatch_kill_switch_enabled' : 'dispatch_kill_switch_disabled';
    const detail = killSwitch
      ? 'Global dispatch kill-switch activated by user/API.'
      : 'Global dispatch kill-switch deactivated by user/API.';

    await appendAuditLog({
      transaction_id: 'SYSTEM',
      stage: 'guardrails',
      event_type,
      detail,
    });

    const latestBatch = await getLatestBatchRun();
    let activeBatchId: string | null = null;
    let activeBatchStatus: string | null = null;

    if (latestBatch) {
      activeBatchId = latestBatch.id;
      activeBatchStatus = latestBatch.status;

      // If enabling kill-switch while a batch is running, transition batch to paused
      if (killSwitch && latestBatch.status === 'running') {
        const updatedBatch = await updateBatchRun(latestBatch.id, { status: 'paused' });
        activeBatchStatus = updatedBatch ? updatedBatch.status : 'paused';
      }
    }

    return NextResponse.json({
      dispatchKillSwitch: updatedSettings.dispatch_kill_switch,
      updatedAt: updatedSettings.updated_at,
      updatedBy: updatedSettings.updated_by,
      activeBatchId,
      activeBatchStatus,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
