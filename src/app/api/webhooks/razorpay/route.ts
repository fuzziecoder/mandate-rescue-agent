import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { ingestRazorpayWebhookEvent } from '@/lib/webhooks/razorpayIngestion';

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    if (!rawBody) {
      return NextResponse.json({ error: 'Empty payload' }, { status: 400 });
    }

    const isSimulationMode = process.env.WEBHOOK_SIMULATION_MODE === 'true';

    // Simulation Security check: Require simulation header in simulation mode
    if (isSimulationMode) {
      const simHeader = request.headers.get('x-mandate-rescue-simulation');
      if (simHeader !== 'true') {
        return NextResponse.json(
          { error: 'Forbidden: Missing x-mandate-rescue-simulation header in simulation mode.' },
          { status: 403 }
        );
      }
    } else {
      // Production Security check: Verify Razorpay HMAC signature
      const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!secret) {
        return NextResponse.json(
          { error: 'Server misconfiguration: RAZORPAY_WEBHOOK_SECRET is missing.' },
          { status: 500 }
        );
      }

      const sigHeader = process.env.RAZORPAY_WEBHOOK_SIGNATURE_HEADER || 'x-razorpay-signature';
      const signature = request.headers.get(sigHeader);

      if (!signature) {
        return NextResponse.json({ error: 'Missing webhook signature header.' }, { status: 401 });
      }

      const expectedSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const sigBuffer = Buffer.from(signature, 'utf8');
      const expectedBuffer = Buffer.from(expectedSig, 'utf8');

      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
      }
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const eventType = request.headers.get('x-razorpay-event') || payload?.event || 'payment.failed';

    // TODO: In high-throughput production systems, enqueue rawBody to worker queue (e.g. SQS/BullMQ)
    // after receipt persistence to ensure instant <200ms HTTP responses.
    const result = await ingestRazorpayWebhookEvent({
      eventType,
      rawBody,
      payload,
      mode: isSimulationMode ? 'simulation' : 'production',
    });

    const statusCode = result.status === 'failed' ? 500 : 200;

    return NextResponse.json(
      {
        received: true,
        status: result.status,
        eventType,
        providerEventId: result.providerEventId,
        transactionId: result.normalizedTransactionId,
        ledgerPosted: result.ledgerPosted ?? false,
        message: result.message,
      },
      { status: statusCode }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Internal server error processing webhook' },
      { status: 500 }
    );
  }
}
