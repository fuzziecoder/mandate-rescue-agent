import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * POST /api/webhooks/simulate
 *
 * Fires a test Razorpay-style webhook event to /api/webhooks/razorpay.
 * Optionally computes the correct HMAC if RAZORPAY_WEBHOOK_SECRET is set,
 * so you can test end-to-end signature verification without ngrok.
 *
 * Body (all optional):
 *   {
 *     event: 'payment.failed' | 'subscription.charged' | 'subscription.halted' | ...
 *     amount: number (in INR, default 1000)
 *     customerId: string
 *     bankName: 'HDFC' | 'ICICI' | 'SBI' | ...
 *   }
 */
export async function POST(request: Request) {
  let body: any = {};
  try {
    body = await request.json();
  } catch {}

  const eventType: string = body.event || 'payment.failed';
  const amountPaise = Math.round((body.amount || 1000) * 100);
  const customerId = body.customerId || `cust_sim_${Date.now()}`;
  const bank = body.bankName || 'HDFC';
  const eventId = `evt_sim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const paymentId = `pay_sim_${Date.now()}`;
  const subscriptionId = `sub_sim_${Date.now()}`;

  let eventPayload: any;

  if (eventType === 'payment.failed' || eventType === 'subscription.pending') {
    eventPayload = {
      event: eventType,
      event_id: eventId,
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment: {
          entity: {
            id: paymentId,
            amount: amountPaise,
            currency: 'INR',
            bank,
            customer_id: customerId,
            token_id: `token_sim_${Date.now()}`,
            description: 'Simulated Subscription Autopay',
            error_code: 'INSUFFICIENT_FUNDS',
            error_description: 'Simulated insufficient funds error',
          },
        },
        subscription: {
          entity: {
            id: subscriptionId,
            customer_id: customerId,
          },
        },
      },
    };
  } else if (eventType === 'subscription.charged' || eventType === 'payment.captured') {
    eventPayload = {
      event: eventType,
      event_id: eventId,
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        payment: {
          entity: {
            id: paymentId,
            amount: amountPaise,
            currency: 'INR',
            customer_id: customerId,
            notes: { original_transaction_id: body.originalTransactionId || '' },
          },
        },
      },
    };
  } else if (eventType === 'subscription.halted') {
    eventPayload = {
      event: eventType,
      event_id: eventId,
      created_at: Math.floor(Date.now() / 1000),
      payload: {
        subscription: {
          entity: {
            id: subscriptionId,
            customer_id: customerId,
          },
        },
      },
    };
  } else {
    return NextResponse.json({ error: `Unsupported event type: ${eventType}` }, { status: 400 });
  }

  const rawBody = JSON.stringify(eventPayload);
  const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (secret) {
    // Compute correct HMAC so the verify step passes
    const hmac = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    headers['x-razorpay-signature'] = hmac;
  }

  // Fire request to own webhook handler
  const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
  const webhookUrl = `${baseUrl}/api/webhooks/razorpay`;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: rawBody,
    });
    const result = await res.json();
    return NextResponse.json({
      simulated: true,
      eventType,
      eventId,
      webhookResponse: result,
      hmacComputed: Boolean(secret),
    });
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to call webhook: ${err.message}` }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    info: 'POST to this endpoint to fire a simulated Razorpay webhook event',
    body: {
      event: 'payment.failed | subscription.charged | subscription.halted',
      amount: 'number (INR)',
      customerId: 'string',
      bankName: 'HDFC | ICICI | SBI | AXIS',
      originalTransactionId: 'string (for charged events)',
    },
  });
}
