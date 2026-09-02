export const ALLOWED_FAILURE_CAUSES = [
  "low_balance",
  "bank_offline",
  "expired_mandate",
  "limit_exceeded",
  "wrong_debit_date",
  "unknown"
] as const;

export type FailureCause = typeof ALLOWED_FAILURE_CAUSES[number];

export interface AiClassificationSuggestion {
  cause: FailureCause;
  confidence: number;
  reasoning: string;
  provider: "puter";
  model: string;
  generatedAt: string;
}
