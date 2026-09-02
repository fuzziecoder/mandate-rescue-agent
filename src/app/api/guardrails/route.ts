import { NextResponse } from 'next/server';
import { getGuardrailChecks, getGlobalSettings, getTransactions, getDecisions } from '@/lib/db';

export async function GET() {
  try {
    const [checks, settings, transactions, decisions] = await Promise.all([
      getGuardrailChecks(),
      getGlobalSettings(),
      getTransactions(),
      getDecisions(),
    ]);

    const txMap = new Map(transactions.map(t => [t.id, t]));
    const decMap = new Map(decisions.map(d => [d.transaction_id, d]));

    const totalChecked = checks.length;
    let allowed = 0;
    let blocked = 0;
    let quietHoursBlocked = 0;
    let retryCapBlocked = 0;
    let nudgeCapBlocked = 0;
    let optOutBlocked = 0;

    const events = checks.map(c => {
      const isAllowed = c.passed;
      if (isAllowed) {
        allowed++;
      } else {
        blocked++;
        if (c.check_name === 'quiet_hours') quietHoursBlocked++;
        else if (c.check_name === 'retry_cap') retryCapBlocked++;
        else if (c.check_name === 'max_contacts') nudgeCapBlocked++;
        else if (c.check_name === 'opt_out') optOutBlocked++;
      }

      const tx = txMap.get(c.transaction_id);
      const dec = decMap.get(c.transaction_id);

      return {
        transaction_id: c.transaction_id,
        timestamp: tx?.failed_at || new Date().toISOString(),
        allowed: c.passed,
        reason: c.detail,
        rule: c.check_name,
        action: dec?.chosen_action || 'unknown',
        customer_id: tx?.customer_id || 'unknown',
      };
    });

    // Sort events by timestamp DESC
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({
      summary: {
        totalChecked,
        allowed,
        blocked,
        quietHoursBlocked,
        retryCapBlocked,
        nudgeCapBlocked,
        optOutBlocked,
        killSwitchActive: settings?.pause_outgoing_contacts ?? false,
        note: totalChecked === 0 ? 'No observed events in this batch.' : undefined,
      },
      events,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { paused } = body;
    if (paused === undefined) {
      return NextResponse.json({ error: 'Missing paused parameter' }, { status: 400 });
    }
    const { saveGlobalSettings } = await import('@/lib/db');
    await saveGlobalSettings({ pause_outgoing_contacts: !!paused });
    return NextResponse.json({ success: true, paused: !!paused });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
