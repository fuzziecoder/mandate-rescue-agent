import { Transaction, Classification } from './db';

export type RecoveryAction = "nudge" | "other";

export interface DecisionResult {
  transactionId: string;
  action: RecoveryAction;
  reason: string;
  confidence: number; // 0–1
  metadata?: {
    channel?: "whatsapp" | "sms" | "email";
  };
}

export interface NudgePolicy {
  maxNudgesPerTransaction: number;
  allowNudgeForLimitExceeded: boolean;
  defaultNudgeChannel: "whatsapp" | "sms" | "email";
}

export const DEFAULT_NUDGE_POLICY: NudgePolicy = {
  maxNudgesPerTransaction: 2,
  allowNudgeForLimitExceeded: true,
  defaultNudgeChannel: "whatsapp",
};

export function decideRecoveryAction(
  transaction: Transaction,
  classification: Classification,
  policy: NudgePolicy = DEFAULT_NUDGE_POLICY
): DecisionResult {
  const txId = transaction.id;

  // 1. Opt-out check
  const isOptedOut =
    transaction.metadata?.opted_out === true ||
    transaction.customer_payment_history?.opt_out === true;

  if (isOptedOut) {
    return {
      transactionId: txId,
      action: "other",
      reason: "Customer has opted out; no nudge allowed.",
      confidence: 1.0,
    };
  }

  const cause = classification.predicted_cause || classification.cause || "";
  const nudgeCount =
    transaction.metadata?.nudge_count ??
    transaction.customer_payment_history?.recent_nudges_count ??
    0;

  // 2. Low Balance
  if (cause === "low_balance" || cause === "insufficient_balance") {
    if (nudgeCount < policy.maxNudgesPerTransaction) {
      return {
        transactionId: txId,
        action: "nudge",
        reason: "Low balance; nudging customer to ensure funds before retry.",
        confidence: classification.confidence || 0.95,
        metadata: {
          channel: policy.defaultNudgeChannel,
        },
      };
    } else {
      return {
        transactionId: txId,
        action: "other",
        reason: "Nudge cap reached for this transaction.",
        confidence: 0.9,
      };
    }
  }

  // 3. Limit Exceeded
  if (cause === "limit_exceeded" || cause === "limit_hit") {
    if (policy.allowNudgeForLimitExceeded && nudgeCount < policy.maxNudgesPerTransaction) {
      return {
        transactionId: txId,
        action: "nudge",
        reason: "Limit exceeded; nudging customer to arrange funds or update limit.",
        confidence: classification.confidence || 0.9,
        metadata: {
          channel: policy.defaultNudgeChannel,
        },
      };
    } else {
      return {
        transactionId: txId,
        action: "other",
        reason: "Nudge not allowed or cap reached for limit exceeded failure.",
        confidence: 0.9,
      };
    }
  }

  // 4. Other causes
  return {
    transactionId: txId,
    action: "other",
    reason: `Cause ${cause || 'unknown'} is routed to other recovery action.`,
    confidence: classification.confidence || 0.8,
  };
}
