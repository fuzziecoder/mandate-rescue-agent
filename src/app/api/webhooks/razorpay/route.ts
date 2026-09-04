import { NextResponse } from 'next/server';
import { verifyRazorpaySignature } from '@/lib/providers/razorpay';
import { processRazorpayWebhookEvent } from '@/lib/webhooks/razorpayIngestion';
import { getLedgerEntries, getTransactions } from '@/lib/db';

/**
 * POST /api/webhooks/razorpay
 *
 * Receives Razorpay webhook events. Verification logic:
 *   • If RAZORPAY_WEBHOOK_SECRET is set AND WEBHOOK_SIMULATION_MODE != 'true':
 *       → HMAC-SHA256 of raw body bytes must match x-razorpay-signature header.
 *         The raw body is used verbatim — never re-parsed or re-stringified.
 *   • If secret is blank OR simulation mode is on:
 *       → Signature check is skipped (safe for local dev / sandbox).
 *
 * Event types handled:
 *   payment.failed         → ingest → classify → decide → execute pipeline
 *   subscription.pending   → same as payment.failed
 *   subscription.charged   → post recovery to ledger
 *   payment.captured       → same as subscription.charged
 *   subscription.halted    → mark as stopped, no ledger entry
 */
export async function POST(request: Request) {
  // 1. Read exact raw bytes — never parse first, re-stringify, then verify.
  //    Razorpay signs the original byte stream; any transformation breaks HMAC.
  const rawBody = await request.text();

  const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  const simulationMode = (process.env.WEBHOOK_SIMULATION_MODE || 'true').trim() === 'true';

  const sigHeader = (
    process.env.RAZORPAY_WEBHOOK_SIGNATURE_HEADER || 'x-razorpay-signature'
  ).toLowerCase();
  const signature = request.headers.get(sigHeader) || '';

  // 2. Enforce HMAC-SHA256 when secret is configured and simulation is off.
  if (!simulationMode && secret) {
    if (!signature) {
      console.warn('[Webhook] Missing signature header — rejecting.');
      return NextResponse.json(
        { error: 'Missing x-razorpay-signature header' },
        { status: 401 }
      );
    }
    const isValid = verifyRazorpaySignature(rawBody, signature, secret);
    if (!isValid) {
      console.warn('[Webhook] Invalid HMAC signature — rejecting event.');
      return NextResponse.json(
        { error: 'Invalid Razorpay webhook signature' },
        { status: 401 }
      );
    }
  }

  // 3. Parse JSON only after signature is verified.
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // 4. Process the event (deduplication, ingestion, pipeline, ledger posting).
  try {
    const result = await processRazorpayWebhookEvent(payload, simulationMode);
    const statusCode = result.status === 'error' ? 500 : 200;
    console.log(`[Webhook] Event ${payload.event || 'unknown'} → ${result.status}: ${result.message}`);
    return NextResponse.json(result, { status: statusCode });
  } catch (err: any) {
    console.error('[Webhook] Unhandled error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/webhooks/razorpay
 * Health check — returns recent event stats from ledger & transactions.
 */
export async function GET() {
  try {
    const [ledger, txs] = await Promise.all([getLedgerEntries(), getTransactions()]);
    return NextResponse.json({
      status: 'ok',
      simulationMode: (process.env.WEBHOOK_SIMULATION_MODE || 'true') === 'true',
      secretConfigured: Boolean((process.env.RAZORPAY_WEBHOOK_SECRET || '').trim()),
      ingestedTransactions: txs.length,
      ledgerEntries: ledger.length,
      endpoint: '/api/webhooks/razorpay',
      acceptedEvents: [
        'payment.failed',
        'subscription.pending',
        'subscription.charged',
        'payment.captured',
        'subscription.halted',
      ],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
