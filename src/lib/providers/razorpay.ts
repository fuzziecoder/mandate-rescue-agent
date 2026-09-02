import crypto from 'crypto';
import { NormalizedProviderEvent, NormalizedFailureEvent, NormalizedSuccessEvent } from './types';

export function normalizeRazorpayWebhook(
  eventType: string,
  payload: unknown
): NormalizedProviderEvent | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const p = payload as Record<string, any>;
  const event = String(eventType || p.event || '').trim();

  const supportedEvents = [
    'payment.failed',
    'payment.captured',
    'subscription.pending',
    'subscription.charged',
    'subscription.halted',
  ];

  if (!supportedEvents.includes(event)) {
    return null;
  }

  // Extract explicit event ID or create deterministic SHA-256 hash
  let provider_event_id = String(p.event_id || p.id || '').trim();
  if (!provider_event_id) {
    const rawKey = `${event}_${JSON.stringify(p.payload || p.contains || p)}`;
    provider_event_id = 'evt_' + crypto.createHash('sha256').update(rawKey).digest('hex').slice(0, 16);
  }

  const payloadEntity = p.payload || {};
  const paymentEntity = payloadEntity.payment?.entity || p.payment || {};
  const subscriptionEntity = payloadEntity.subscription?.entity || p.subscription || {};

  const provider_payment_id = paymentEntity.id ? String(paymentEntity.id) : null;
  const provider_subscription_id = subscriptionEntity.id
    ? String(subscriptionEntity.id)
    : paymentEntity.subscription_id
    ? String(paymentEntity.subscription_id)
    : null;

  const mandate_id =
    paymentEntity.token_id ||
    paymentEntity.mandate_id ||
    subscriptionEntity.token_id ||
    subscriptionEntity.mandate_id ||
    (provider_subscription_id ? `mand_${provider_subscription_id.slice(-8)}` : null);

  const rawAmount = paymentEntity.amount ?? subscriptionEntity.amount ?? 0;
  const amountInRupees = typeof rawAmount === 'number' ? rawAmount / 100 : Number(rawAmount) / 100 || 0;

  const rawCurrency = String(paymentEntity.currency || subscriptionEntity.currency || 'INR').toUpperCase();
  if (rawCurrency !== 'INR') {
    return null; // Unsupported currency
  }

  const occurredAtTs = p.created_at || paymentEntity.created_at || subscriptionEntity.created_at || Math.floor(Date.now() / 1000);
  const occurred_at = new Date(occurredAtTs * 1000).toISOString();

  // Handle Success Events
  if (event === 'payment.captured' || event === 'subscription.charged') {
    const explicitOriginalTxId = p.original_failure_transaction_id || paymentEntity.notes?.original_transaction_id || null;

    const successEvent: NormalizedSuccessEvent = {
      kind: 'success',
      provider: 'razorpay',
      provider_event_id,
      provider_event_type: event as 'payment.captured' | 'subscription.charged',
      occurred_at,
      provider_payment_id: provider_payment_id || `pay_${provider_event_id.slice(-10)}`,
      provider_subscription_id,
      original_failure_transaction_id: explicitOriginalTxId,
      mandate_id,
      amount: amountInRupees,
      currency: 'INR',
    };
    return successEvent;
  }

  // Handle Failure & Halted Events
  const errorCode =
    paymentEntity.error_code ||
    subscriptionEntity.error_code ||
    p.error_code ||
    'RAZORPAY_UNKNOWN_FAILURE';

  const errorMessage =
    paymentEntity.error_description ||
    paymentEntity.error_reason ||
    subscriptionEntity.error_description ||
    p.error_description ||
    'Provider reported a failed/pending subscription event without a detailed error message.';

  const customer_id =
    paymentEntity.customer_id ||
    subscriptionEntity.customer_id ||
    `cust_${(provider_payment_id || provider_event_id).slice(-6)}`;

  const bank_name =
    paymentEntity.bank ||
    paymentEntity.issuer ||
    'Razorpay PSP / Partner Bank';

  const subscription_type =
    subscriptionEntity.plan_id ||
    paymentEntity.description ||
    'UPI Autopay Subscription';

  const transactionId = `rzp_${provider_payment_id || provider_event_id}`;

  const failureEvent: NormalizedFailureEvent = {
    kind: 'failure',
    provider: 'razorpay',
    provider_event_id,
    provider_event_type: event as 'payment.failed' | 'subscription.pending' | 'subscription.halted',
    occurred_at,
    provider_payment_id,
    provider_subscription_id,
    transaction: {
      id: transactionId,
      customer_id,
      amount: amountInRupees,
      currency: 'INR',
      mandate_id,
      bank_name,
      error_code: errorCode,
      error_message: errorMessage,
      failed_at: occurred_at,
      subscription_type,
      customer_payment_history: {
        past_success_rate: 0,
        avg_balance_pattern: 'unknown',
        payment_timing: 'unknown',
        opt_out: false,
        recent_nudges_count: 0,
        past_retry_attempts: 0,
      },
    },
  };

  return failureEvent;
}
