import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { ingestRazorpayWebhookEvent } from '@/lib/webhooks/razorpayIngestion';

export async function POST(request: NextRequest) {
  if (process.env.WEBHOOK_SIMULATION_MODE !== 'true') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    const fixtureName = body?.fixture;

    const validFixtures = ['payment.failed', 'subscription.pending', 'subscription.charged', 'subscription.halted'];
    if (!fixtureName || !validFixtures.includes(fixtureName)) {
      return NextResponse.json(
        { error: `Invalid fixture. Allowed fixtures: ${validFixtures.join(', ')}` },
        { status: 400 }
      );
    }

    const fixturePath = path.join(process.cwd(), 'fixtures', 'razorpay', `${fixtureName}.json`);
    if (!fs.existsSync(fixturePath)) {
      return NextResponse.json({ error: `Fixture file not found: ${fixtureName}.json` }, { status: 404 });
    }

    const rawBody = fs.readFileSync(fixturePath, 'utf8');
    const payload = JSON.parse(rawBody);
    const eventType = payload.event || fixtureName;

    const result = await ingestRazorpayWebhookEvent({
      eventType,
      rawBody,
      payload,
      mode: 'simulation',
    });

    return NextResponse.json({
      fixture: fixtureName,
      status: result.status,
      transactionId: result.normalizedTransactionId,
      pipelineStatus: result.pipelineStatus || null,
      ledgerPosted: result.ledgerPosted ?? false,
      message: result.message,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Error processing test fixture' },
      { status: 500 }
    );
  }
}
