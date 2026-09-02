import { FailedTransaction, RootCause } from './types';
import { classifyRuleBased } from './classifier';

export function classifyFailure(tx: FailedTransaction): { cause: RootCause; confidence: number; reasoning: string } {
  const code = tx.errorCode || (tx as any).error_code || '';
  const msg = tx.errorMessage || (tx as any).error_message || '';

  const matched = classifyRuleBased(code, msg);
  if (matched) {
    // map expired_mandate or limit_exceeded or wrong_debit_date to RootCause if needed
    let cause: RootCause = matched.cause as RootCause;
    if ((matched.cause as string) === 'expired_mandate') cause = 'mandate_expired';
    return {
      cause,
      confidence: matched.confidence,
      reasoning: matched.reasoning
    };
  }

  return {
    cause: 'ambiguous',
    confidence: 0.5,
    reasoning: 'Fallback classification: Transaction response contains generic decline parameters.'
  };
}
