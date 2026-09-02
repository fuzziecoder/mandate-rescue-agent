-- Supabase Schema for Mandate Rescue
-- Database: PostgreSQL

-- Drop tables if they exist (for clean runs)
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS executions CASCADE;
DROP TABLE IF EXISTS guardrail_checks CASCADE;
DROP TABLE IF EXISTS decisions CASCADE;
DROP TABLE IF EXISTS classifications CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;

-- Drop enums if they exist
DROP TYPE IF EXISTS predicted_cause_type CASCADE;
DROP TYPE IF EXISTS chosen_action_type CASCADE;
DROP TYPE IF EXISTS outcome_type CASCADE;
DROP TYPE IF EXISTS stage_type CASCADE;

-- Enums
CREATE TYPE predicted_cause_type AS ENUM (
  'insufficient_balance', 
  'bank_downtime', 
  'mandate_expired', 
  'limit_exceeded', 
  'unknown'
);

CREATE TYPE chosen_action_type AS ENUM (
  'retry', 
  'nudge', 
  'reauth', 
  'stop'
);

CREATE TYPE outcome_type AS ENUM (
  'recovered', 
  'still_failed', 
  'pending', 
  'stopped'
);

CREATE TYPE stage_type AS ENUM (
  'classify', 
  'decide', 
  'guardrail', 
  'execute'
);

-- 1. Transactions Table
CREATE TABLE transactions (
  id VARCHAR(255) PRIMARY KEY,
  customer_id VARCHAR(255) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'INR',
  mandate_id VARCHAR(255) NOT NULL,
  bank_name VARCHAR(255) NOT NULL,
  error_code VARCHAR(100) NOT NULL,
  error_message TEXT NOT NULL,
  failed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  customer_payment_history JSONB NOT NULL,
  subscription_type VARCHAR(255) NOT NULL
);

-- 2. Classifications Table
CREATE TABLE classifications (
  transaction_id VARCHAR(255) PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
  predicted_cause predicted_cause_type NOT NULL,
  confidence DECIMAL(3, 2) NOT NULL,
  reasoning_text TEXT NOT NULL,
  method VARCHAR(50) NOT NULL -- 'rule' | 'llm'
);

-- 3. Decisions Table
CREATE TABLE decisions (
  transaction_id VARCHAR(255) PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
  chosen_action chosen_action_type NOT NULL,
  reasoning_text TEXT NOT NULL,
  stop_reason VARCHAR(255)
);

-- 4. Guardrail Checks Table
CREATE TABLE guardrail_checks (
  id SERIAL PRIMARY KEY,
  transaction_id VARCHAR(255) REFERENCES transactions(id) ON DELETE CASCADE,
  check_name VARCHAR(100) NOT NULL, -- 'retry_cap' | 'quiet_hours' | 'opt_out' | 'max_contacts'
  passed BOOLEAN NOT NULL,
  detail TEXT NOT NULL
);

-- 5. Executions Table
CREATE TABLE executions (
  transaction_id VARCHAR(255) PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
  action_taken VARCHAR(100) NOT NULL,
  outcome outcome_type NOT NULL,
  amount_recovered DECIMAL(12, 2) DEFAULT 0,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  stop_reason VARCHAR(255)
);

-- 6. Audit Log Table (Master Pipeline Trace)
CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  transaction_id VARCHAR(255) REFERENCES transactions(id) ON DELETE CASCADE,
  stage stage_type NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add performance indexes
CREATE INDEX idx_transactions_customer ON transactions(customer_id);
CREATE INDEX idx_audit_log_txn ON audit_log(transaction_id);
CREATE INDEX idx_guardrail_checks_txn ON guardrail_checks(transaction_id);
