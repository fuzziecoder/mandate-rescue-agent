import { RootCause, RecoveryAction, FailedTransaction } from './types';

export interface DecisionResult {
  action: RecoveryAction;
  reasoning: string;
  scheduleDelayHours: number;
}

export function decideRecovery(
  cause: RootCause,
  tx: FailedTransaction
): DecisionResult {
  const history = tx.customerPaymentHistory || (tx as any).customer_payment_history || { past_success_rate: 0.8, avg_balance_pattern: 'normal' };
  const rate = history.past_success_rate !== undefined ? history.past_success_rate : 0.8;
  const isTrusted = rate >= 0.75;

  switch (cause) {
    case 'low_balance':
      if (isTrusted) {
        return {
          action: 'nudge',
          reasoning: `Trusted customer (success rate ${(rate * 100).toFixed(0)}%). Sending polite Hinglish text notification first.`,
          scheduleDelayHours: 0
        };
      } else {
        return {
          action: 'retry',
          reasoning: `Unreliable account history (success rate ${(rate * 100).toFixed(0)}%). Scheduling retry in 3 days (salary window).`,
          scheduleDelayHours: 72
        };
      }

    case 'bank_offline':
      return {
        action: 'retry',
        reasoning: 'Bank routing node timeout. Retrying in 1 hour via alternative rails.',
        scheduleDelayHours: 1
      };

    case 'mandate_expired':
    case 'mandate_revoked':
      return {
        action: 'reauth',
        reasoning: 'Mandate is no longer legally authorized. Redirecting user to complete re-authorization flow.',
        scheduleDelayHours: 0
      };

    case 'limit_exceeded':
      if (isTrusted && tx.amount > 1000) {
        return {
          action: 'schedule_split',
          reasoning: 'High-ticket limit decline. Splitting transaction into smaller payment targets.',
          scheduleDelayHours: 24
        };
      } else {
        return {
          action: 'retry',
          reasoning: 'Mandate limit threshold hit. Retrying in 24 hours after daily reset limits.',
          scheduleDelayHours: 24
        };
      }

    case 'wrong_debit_date':
      return {
        action: 'retry',
        reasoning: 'Incorrect cycle run date. Delaying retry by 48 hours for correct cycle alignment.',
        scheduleDelayHours: 48
      };

    case 'ambiguous':
    default:
      if (tx.amount < 5000) {
        return {
          action: 'retry',
          reasoning: 'Ambiguous error on low-value ticket. Performing low-cost retry retry in 24 hours.',
          scheduleDelayHours: 24
        };
      } else {
        return {
          action: 'stop',
          reasoning: 'High-value ticket ambiguous failure. Stopping communications for manual support check.',
          scheduleDelayHours: 0
        };
      }
  }
}
