import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { processRazorpayWebhookEvent } from '@/lib/webhooks/razorpayIngestion';

const ALLOWED_FIXTURES = new Set([
  'payment.failed',
  'subscription.pending',
  'subscription.charged',
  'subscription.halted',
]);

export async function POST(request: Request) {
  const isSimulationMode = (process.env.WEBHOOK_SIMULATION_MODE || 'true') === 'true';
  if (!isSimulationMode) {
    return NextResponse.json(
      { error: 'Test webhook endpoint is disabled outside simulation mode.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const fixtureName = body.fixture || 'payment.failed';

    if (!ALLOWED_FIXTURES.has(fixtureName)) {
      return NextResponse.json(
        { error: `Invalid fixture name '${fixtureName}'. Allowed values: payment.failed, subscription.pending, subscription.charged, subscription.halted` },
        { status: 400 }
      );
    }

    const fixturePath = path.join(process.cwd(), 'fixtures', 'razorpay', `${fixtureName}.json`);
    if (!fs.existsSync(fixturePath)) {
      return NextResponse.json(
        { error: `Fixture file ${fixtureName}.json not found.` },
        { status: 404 }
      );
    }

    const rawData = fs.readFileSync(fixturePath, 'utf8');
    const fixtureData = JSON.parse(rawData);

    const result = await processRazorpayWebhookEvent(fixtureData, true);

    return NextResponse.json({
      fixture: fixtureName,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
