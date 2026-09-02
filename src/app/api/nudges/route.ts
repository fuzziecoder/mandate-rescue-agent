import { NextResponse } from 'next/server';
import { getAllNormalizedTransactions } from '@/lib/normalizers';

export async function GET() {
  try {
    const normalized = await getAllNormalizedTransactions();

    const templates = [
      {
        id: 'tpl_balance_hinglish',
        cause: 'insufficient_balance',
        channel: 'SMS / WhatsApp',
        template: 'Namaste {{name}}, aapka {{subscription}} ka autopay Rs {{amount}} low balance ki wajah se fail hua hai. Kripya account top up karein taaki retry ho sake.',
      },
      {
        id: 'tpl_reauth_hinglish',
        cause: 'mandate_expired',
        channel: 'Web Reauth',
        template: 'Namaste {{name}}, aapka UPI Autopay mandate expire ho gaya hai. 1-click me re-authorize karein: https://pay.rescue/mandate/{{mandate_id}}',
      },
      {
        id: 'tpl_limit_hinglish',
        cause: 'limit_exceeded',
        channel: 'SMS',
        template: 'Namaste {{name}}, aapka transaction daily UPI limit exceed kar gaya. Split schedule activate karein: https://pay.rescue/split/{{transaction_id}}',
      },
    ];

    const previews = normalized
      .filter(t => t.action_chosen === 'nudge' || t.action_chosen === 'reauth' || t.failure_cause === 'insufficient_balance')
      .slice(0, 50)
      .map(t => {
        const isOptedOut = t.customer_payment_history.opt_out;
        const recentNudges = t.customer_payment_history.recent_nudges_count || 0;
        const nudgeCap = 2;

        let contactAllowed = true;
        let guardrailReason = 'All contact guardrails passed';

        if (isOptedOut) {
          contactAllowed = false;
          guardrailReason = 'Customer opted out of notifications';
        } else if (recentNudges >= nudgeCap) {
          contactAllowed = false;
          guardrailReason = `Weekly nudge cap (${nudgeCap}) reached`;
        }

        const channel = t.action_chosen === 'reauth' ? 'Web Reauth' : 'SMS / WhatsApp';
        let message = `Namaste! Aapka ₹${t.amount} ka ${t.subscription_type} autopay ${t.failure_cause ? t.failure_cause.replace('_', ' ') : 'payment'} error ki wajah se complete nahi ho saka. Kripya pay.rescue/u/${t.id} par visit karein.`;

        if (t.failure_cause === 'insufficient_balance') {
          message = `Namaste! Aapka ${t.subscription_type} ka autopay ₹${t.amount} account balance kam hone ki wajah se pause ho gaya hai. Account top up karke smooth access continue karein.`;
        } else if (t.failure_cause === 'mandate_expired' || t.action_chosen === 'reauth') {
          message = `Namaste! Aapka UPI Autopay mandate expire ho gaya hai. 1-click re-authorization se services restore karein: https://pay.rescue/m/${t.mandate_id}`;
        }

        return {
          transaction_id: t.id,
          customer_id: t.customer_id,
          failure_cause: t.failure_cause,
          action: t.action_chosen,
          channel,
          message,
          contactAllowed,
          guardrailReason,
          recentNudgesCount: recentNudges,
          nudgeCap,
        };
      });

    return NextResponse.json({
      templates,
      previews,
      mode: 'Preview / Simulation Mode Only - No actual messages sent',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
