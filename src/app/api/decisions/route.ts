import { NextResponse } from 'next/server';
import {
  getDecisions,
  getClassifications,
  getGuardrailChecks,
} from '@/lib/db';
import { getAllNormalizedTransactions } from '@/lib/normalizers';

export async function GET() {
  try {
    const [decisions, classifications, guardrailChecks, normalized] = await Promise.all([
      getDecisions(),
      getClassifications(),
      getGuardrailChecks(),
      getAllNormalizedTransactions(),
    ]);

    const totalDecisions = decisions.length;

    const byAction: { [key: string]: number } = {};
    const byFailureCause: { [key: string]: number } = {};
    let ruleBasedCount = 0;
    let llmTiebreakCount = 0;
    let noActionOrStoppedCount = 0;

    for (const cls of classifications) {
      if (cls.method === 'rule') ruleBasedCount++;
      else if (cls.method === 'llm') llmTiebreakCount++;
    }

    for (const dec of decisions) {
      byAction[dec.chosen_action] = (byAction[dec.chosen_action] || 0) + 1;
      if (dec.chosen_action === 'stop') {
        noActionOrStoppedCount++;
      }
    }

    const data = normalized.map(txView => {
      const dec = decisions.find(d => d.transaction_id === txView.id);
      const action_chosen = dec?.chosen_action || txView.action_chosen || 'stop';
      const decision_reason = dec?.reasoning_text || txView.decision_reason || 'No decision recorded';

      if (txView.failure_cause) {
        byFailureCause[txView.failure_cause] = (byFailureCause[txView.failure_cause] || 0) + 1;
      }

      const pastAttempts = txView.customer_payment_history.past_retry_attempts || 0;
      const escalation_rung = action_chosen === 'nudge'
        ? 'Rung 1: SMS Nudge'
        : action_chosen === 'retry'
          ? 'Rung 2: Auto Retry'
          : action_chosen === 'reauth'
            ? 'Rung 3: Web Reauth'
            : 'Rung 0: Stopped';

      const touches_remaining = Math.max(0, 3 - pastAttempts);
      const consent_status = txView.customer_payment_history.opt_out ? 'Opted-Out' : 'Consent Active';
      const value_floor_passed = txView.amount >= 100;

      return {
        transaction: txView,
        action_chosen,
        decision_reason,
        scheduled_for: txView.scheduled_for,
        escalation_rung,
        touches_remaining,
        consent_status,
        value_floor_passed,
      };
    });

    return NextResponse.json({
      summary: {
        totalDecisions,
        byAction,
        byFailureCause,
        ruleBasedCount,
        llmTiebreakCount,
        noActionOrStoppedCount,
      },
      data,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
