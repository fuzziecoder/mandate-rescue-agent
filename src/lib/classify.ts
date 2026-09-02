import { FailedTransaction, RootCause } from './types';

export function classifyFailure(tx: FailedTransaction): { cause: RootCause; confidence: number; reasoning: string } {
  const code = (tx.errorCode || (tx as any).error_code || '').toUpperCase();
  const msg = (tx.errorMessage || (tx as any).error_message || '').toLowerCase();

  // 1. Low Balance
  if (
    code.includes('INSUFFICIENT_FUNDS') || 
    code.includes('BAL_LOW') || 
    code.includes('LBL') ||
    msg.includes('insufficient') || 
    msg.includes('low balance') ||
    msg.includes('no funds')
  ) {
    return {
      cause: 'low_balance',
      confidence: 1.0,
      reasoning: 'Classified via rule: Error signature matches insufficient balance indicator.'
    };
  }

  // 2. Bank Offline
  if (
    code.includes('OFFLINE') || 
    code.includes('TIMEOUT') || 
    code.includes('DOWNTIME') ||
    code.includes('PSP_ERR') ||
    msg.includes('unavailable') || 
    msg.includes('timed out') ||
    msg.includes('bank offline') ||
    msg.includes('downtime')
  ) {
    return {
      cause: 'bank_offline',
      confidence: 1.0,
      reasoning: 'Classified via rule: Network or database timeout detected at payment provider/gateway.'
    };
  }

  // 3. Mandate Expired
  if (
    code.includes('EXPIRED') || 
    code.includes('VALIDITY_EXCEEDED') ||
    msg.includes('expired') || 
    msg.includes('lapsed')
  ) {
    return {
      cause: 'mandate_expired',
      confidence: 1.0,
      reasoning: 'Classified via rule: End date of authorization mandate range has passed.'
    };
  }

  // 4. Mandate Revoked
  if (
    code.includes('REVOKED') || 
    code.includes('CANCELLED') ||
    msg.includes('revoked') || 
    msg.includes('cancelled by customer')
  ) {
    return {
      cause: 'mandate_revoked',
      confidence: 1.0,
      reasoning: 'Classified via rule: Customer explicitly cancelled or revoked mandate authorization.'
    };
  }

  // 5. Wrong Debit Date
  if (
    code.includes('WRONG_DEBIT_DATE') || 
    code.includes('DEBIT_DATE_INVALID') ||
    msg.includes('debit date') ||
    msg.includes('outside cycle')
  ) {
    return {
      cause: 'wrong_debit_date',
      confidence: 1.0,
      reasoning: 'Classified via rule: Debit request submitted outside of compliant billing window.'
    };
  }

  // 6. Limit Exceeded
  if (
    code.includes('LIMIT_EXCEEDED') || 
    code.includes('AMT_LIMIT') ||
    msg.includes('limit exceeded') || 
    msg.includes('exceeds limit')
  ) {
    return {
      cause: 'limit_exceeded',
      confidence: 1.0,
      reasoning: 'Classified via rule: Value exceeds daily/monthly transactional bounds set by bank.'
    };
  }

  // 7. Ambiguous Decline
  return {
    cause: 'ambiguous',
    confidence: 0.5,
    reasoning: 'Fallback classification: Transaction response contains generic decline parameters.'
  };
}
