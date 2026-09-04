import crypto from 'crypto';
import { Transaction } from '../db';

/**
 * Verify Razorpay HMAC SHA-256 webhook signature over raw request body
 */
export function verifyRazorpaySignature(rawBody: string, signature: string, secret: string): boolean {
  if (!secret) return true; // Simulation mode when secret is unconfigured
  if (!signature) return false;
  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch (e) {
    return false;
  }
}

/**
 * Normalize Razorpay failure payload into standard FailedTransaction schema
 */
export function normalizeRazorpayEventToTransaction(eventPayload: any): Transaction {
  const event = eventPayload.event || 'payment.failed';
  const payloadObj = eventPayload.payload || {};
  const paymentObj = payloadObj.payment?.entity || {};
  const subObj = payloadObj.subscription?.entity || {};

  const rawAmount = paymentObj.amount || subObj.amount || 100000;
  // Convert paise to INR if amount is large (Razorpay passes amounts in paise)
  const amountInInr = rawAmount >= 100 ? Math.round(rawAmount / 100) : rawAmount;

  const rawTxId = paymentObj.id || subObj.id || `rzp_${Date.now()}`;
  const transactionId = rawTxId.startsWith('rzp_') ? rawTxId : `rzp_${rawTxId}`;

  const errorCode = paymentObj.error_code || subObj.error_code || 'AUTOPAY_FAILED';
  const errorMessage = paymentObj.error_description || subObj.error_description || 'Razorpay autopay debit failed';

  let bankName = paymentObj.bank || 'HDFC';
  if (paymentObj.vpa) {
    const handle = paymentObj.vpa.split('@')[1] || '';
    if (handle.includes('hdfc')) bankName = 'HDFC';
    else if (handle.includes('icici')) bankName = 'ICICI';
    else if (handle.includes('sbi')) bankName = 'SBI';
    else if (handle.includes('axis')) bankName = 'AXIS';
  }

  const customerId = paymentObj.customer_id || subObj.customer_id || `cust_${Math.floor(1000 + Math.random() * 9000)}`;
  const mandateId = paymentObj.token_id || subObj.token_id || `mand_${Math.floor(1000 + Math.random() * 9000)}`;
  const subscriptionType = paymentObj.description || subObj.notes?.subscription_type || 'Subscription Autopay';

  return {
    id: transactionId,
    customer_id: customerId,
    amount: amountInInr,
    currency: paymentObj.currency || subObj.currency || 'INR',
    mandate_id: mandateId,
    bank_name: bankName,
    error_code: errorCode,
    error_message: errorMessage,
    failed_at: new Date(eventPayload.created_at ? eventPayload.created_at * 1000 : Date.now()).toISOString(),
    customer_payment_history: {
      past_success_rate: 0.85,
      avg_balance_pattern: errorCode.includes('INSUFFICIENT') ? 'low' : 'normal',
      payment_timing: 'on_time',
      opt_out: false,
      recent_nudges_count: 0,
      past_retry_attempts: 0,
    },
    subscription_type: subscriptionType,
  };
}
