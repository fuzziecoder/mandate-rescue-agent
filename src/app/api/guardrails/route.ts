import { NextResponse } from 'next/server';
import { getGuardrailChecks, getSettings, updateSettings, getLatestBatchRun, appendAuditLog } from '@/lib/db';

export async function GET() {
  try {
    const [checks, settings, latestBatchRecord] = await Promise.all([
      getGuardrailChecks(),
      getSettings(),
      getLatestBatchRun(),
    ]);

    let totalChecked = checks.length;
    let allowed = 0;
    let blocked = 0;
    let quietHoursBlocked = 0;
    let retryCapBlocked = 0;
    let nudgeCapBlocked = 0;
    let optOutBlocked = 0;
    let killSwitchBlocked = 0;

    for (const check of checks) {
      if (check.passed) {
        allowed++;
      } else {
        blocked++;
        const detail = (check.detail || '').toLowerCase();
        if (check.check_name === 'quiet_hours' || detail.includes('quiet hour')) {
          quietHoursBlocked++;
        } else if (check.check_name === 'retry_cap' || detail.includes('retry cap')) {
          retryCapBlocked++;
        } else if (check.check_name === 'max_contacts' || detail.includes('nudge cap') || detail.includes('weekly nudge')) {
          nudgeCapBlocked++;
        } else if (check.check_name === 'opt_out' || detail.includes('opted out') || detail.includes('opt out')) {
          optOutBlocked++;
        } else if (detail.includes('kill-switch') || detail.includes('kill switch')) {
          killSwitchBlocked++;
        }
      }
    }

    const summary = {
      totalChecked,
      allowed,
      blocked,
      quietHoursBlocked,
      retryCapBlocked,
      nudgeCapBlocked,
      optOutBlocked,
      killSwitchBlocked,
      killSwitchActive: settings.dispatch_kill_switch,
    };

    const events = (checks || []).slice(-30).reverse();

    const latestBatch = latestBatchRecord
      ? {
          id: latestBatchRecord.id,
          status: latestBatchRecord.status,
          processed: latestBatchRecord.processed,
          total: latestBatchRecord.total,
        }
      : {};

    return NextResponse.json({
      dispatchKillSwitch: settings.dispatch_kill_switch,
      summary,
      events,
      latestBatch,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const pauseState = typeof body.paused === 'boolean' ? body.paused :
                       typeof body.dispatchKillSwitch === 'boolean' ? body.dispatchKillSwitch :
                       typeof body.killSwitchActive === 'boolean' ? body.killSwitchActive : true;

    await updateSettings({
      dispatch_kill_switch: pauseState,
      updated_at: new Date().toISOString(),
      updated_by: 'guardrails_ui',
    });

    await appendAuditLog({
      transaction_id: 'SYSTEM',
      stage: 'guardrails',
      event_type: pauseState ? 'dispatch_kill_switch_enabled' : 'dispatch_kill_switch_disabled',
      detail: `Dispatch kill switch set to ${pauseState} via Guardrails API`,
    });

    return NextResponse.json({ success: true, dispatchKillSwitch: pauseState });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
