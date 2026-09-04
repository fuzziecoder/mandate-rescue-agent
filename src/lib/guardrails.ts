import { FailedTransaction } from './types';
import { getSettings } from './db';

export function getISTHour(date: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false
    });
    return parseInt(formatter.format(date));
  } catch (e) {
    // Fallback if zone not supported locally
    const hour = date.getUTCHours() + 5; // offset estimate
    return hour % 24;
  }
}

export function isQuietHour(date: Date): boolean {
  const hour = getISTHour(date);
  return hour < 9 || hour >= 20; // 8 PM (20) to 9 AM (9)
}

export function retryCapReached(attempts: number): boolean {
  return attempts >= 3;
}

export function nudgeCapReached(nudgeCount: number): boolean {
  return nudgeCount >= 2;
}

export function isOptedOut(optOut?: boolean): boolean {
  return !!optOut;
}

export async function contactAllowed(
  tx: FailedTransaction,
  action: string,
  currentDateStr?: string
): Promise<{ allowed: boolean; reason: string }> {
  // Check global kill switch first
  const settings = await getSettings();
  if (settings.dispatch_kill_switch) {
    return { allowed: false, reason: 'Global dispatch kill-switch active' };
  }

  const history = tx.customerPaymentHistory || (tx as any).customer_payment_history || {};
  const isNudge = action === 'nudge';
  const isRetry = action === 'retry';

  // 1. Opt out check
  if (isNudge && isOptedOut(history.opt_out)) {
    return { allowed: false, reason: 'Customer opted out' };
  }

  // 2. Quiet hours check (only for nudges / communication)
  if (isNudge) {
    const date = currentDateStr ? new Date(currentDateStr) : new Date();
    if (isQuietHour(date)) {
      return { allowed: false, reason: 'Quiet hours violation (8 PM - 9 AM IST)' };
    }
  }

  // 3. Retry cap check
  if (isRetry && retryCapReached(history.past_retry_attempts || 0)) {
    return { allowed: false, reason: 'Retry cap reached (Max 3)' };
  }

  // 4. Nudge frequency cap check
  if (isNudge && nudgeCapReached(history.recent_nudges_count || 0)) {
    return { allowed: false, reason: 'Weekly nudge cap reached (Max 2)' };
  }

  return { allowed: true, reason: 'All guardrails passed' };
}
