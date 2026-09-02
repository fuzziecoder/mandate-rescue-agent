export type ProviderName = "razorpay";

export type ProviderEventType =
  | "payment.failed"
  | "payment.captured"
  | "subscription.pending"
  | "subscription.charged"
  | "subscription.halted";

export interface ProviderWebhookReceipt {
  provider: ProviderName;
  provider_event_id: string;
  provider_event_type: ProviderEventType;
  received_at: string;
  payload_hash: string;
  processing_status:
    | "received"
    | "duplicate"
    | "processed"
    | "ignored"
    | "failed";
  normalized_transaction_id?: string | null;
  error_message?: string | null;
}

export interface NormalizedFailureEvent {
  kind: "failure";
  provider: ProviderName;
  provider_event_id: string;
  provider_event_type:
    | "payment.failed"
    | "subscription.pending"
    | "subscription.halted";
  occurred_at: string;
  provider_payment_id: string | null;
  provider_subscription_id: string | null;

  transaction: {
    id: string;
    customer_id: string;
    amount: number;
    currency: "INR";
    mandate_id: string | null;
    bank_name: string | null;
    error_code: string;
    error_message: string;
    failed_at: string;
    subscription_type: string | null;
    customer_payment_history: {
      past_success_rate: number;
      avg_balance_pattern: "unknown";
      payment_timing: "unknown";
      opt_out: boolean;
      recent_nudges_count: number;
      past_retry_attempts: number;
    };
  };
}

export interface NormalizedSuccessEvent {
  kind: "success";
  provider: ProviderName;
  provider_event_id: string;
  provider_event_type: "payment.captured" | "subscription.charged";
  occurred_at: string;
  provider_payment_id: string;
  provider_subscription_id: string | null;
  original_failure_transaction_id: string | null;
  mandate_id: string | null;
  amount: number;
  currency: "INR";
}

export type NormalizedProviderEvent =
  | NormalizedFailureEvent
  | NormalizedSuccessEvent;
