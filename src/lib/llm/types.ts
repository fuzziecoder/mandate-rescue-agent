export const FAILURE_CAUSES = [
  "low_balance",
  "bank_offline",
  "expired_mandate",
  "limit_exceeded",
  "wrong_debit_date",
  "unknown"
] as const;

export type FailureCause = typeof FAILURE_CAUSES[number];

export type ClassificationMethod =
  | "rule_based"
  | "llm_tiebreak"
  | "fallback_unknown"
  | "puter_ai_assist";

export interface AmbiguousClassificationInput {
  error_code: string;
  error_message: string;
  bank_name?: string;
  amount?: number;
  failed_at?: string;
  mandate_status?: string;
}

export interface LlmClassificationResult {
  cause: FailureCause;
  confidence: number;
  reasoning: string;
  provider: "nvidia";
  model: string;
}

export interface ClassificationResult {
  cause: FailureCause;
  confidence: number;
  method: ClassificationMethod;
  reasoning: string;
  requiresManualReview: boolean;
  llmCalled: boolean;
  llmProvider?: "nvidia" | "puter";
  llmModel?: string;
}
