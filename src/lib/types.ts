export interface FailedTransaction {
  id: string;
  amount: number;
  currency: string;
  attemptDate: string;
  debitWindow: string; // e.g. "morning" | "afternoon" | "evening"
  errorCode: string;
  errorMessage: string;
  bank: string;
  customerId: string;
  customerName: string;
  balanceHistory: Array<{ date: string; balance: number }>;
  customerPaymentHistory?: {
    past_success_rate: number;
    avg_balance_pattern: 'normal' | 'low' | 'erratic';
    payment_timing?: 'on_time' | 'late' | 'very_late';
    opt_out?: boolean;
    recent_nudges_count?: number;
    past_retry_attempts?: number;
  };
  subscriptionType?: string;
}

export type RootCause = 
  | 'low_balance' 
  | 'bank_offline' 
  | 'mandate_expired' 
  | 'mandate_revoked' 
  | 'wrong_debit_date' 
  | 'limit_exceeded' 
  | 'ambiguous';

export type RecoveryAction = 
  | 'nudge' 
  | 'retry' 
  | 'reauth' 
  | 'voice' 
  | 'schedule_split' 
  | 'stop';

export interface GuardrailResult {
  passed: boolean;
  checkName: string;
  detail: string;
}

export interface PipelineStep {
  stage: 'classify' | 'decide' | 'guardrail' | 'execute';
  payload: any;
  timestamp: string;
}

export interface LedgerEntry {
  transactionId: string;
  amount: number;
  rootCause: string;
  recoveryActionUsed: string;
  channel: string;
  timestamp: string;
  confidence: number;
}

export type Outcome = 'recovered' | 'pending' | 'stopped';
