import fs from 'fs';
import path from 'path';
import { getJsonDbPath, Transaction } from '../db';

export interface GenerateDatasetOptions {
  transactionCount: number;
  seed?: number;
  resetPipelineState: boolean;
  preserveSettings: boolean;
  source: 'cli' | 'dashboard';
}

const BANKS = [
  'State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 
  'Kotak Mahindra Bank', 'Punjab National Bank', 'Federal Bank', 'Bank of Baroda'
];

const SUBSCRIPTIONS = [
  'SaaS Premium Monthly', 'Gym Membership Standard', 'Ott streaming Annual', 
  'Weekly Milk Delivery', 'Newspaper Daily Nudge', 'Internet Broadband Plus'
];

// Simple deterministic random generator if seed is provided
class PRNG {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

export function generateSyntheticTransactions(count: number, seedValue: number | null, datasetId: string): { txs: Transaction[], distribution: Record<string, number>, totalAtRisk: number } {
  const prng = seedValue !== null ? new PRNG(seedValue) : null;
  const random = () => prng ? prng.next() : Math.random();
  
  const txs: Transaction[] = [];
  const distribution: Record<string, number> = {};
  let totalAtRisk = 0;
  const now = Date.now();

  // Requirements distribution approximation:
  // low_balance: 38%
  // bank_offline: 24%
  // expired_mandate: 20%
  // limit_exceeded: 14%
  // wrong_debit_date: 4%
  
  for (let i = 0; i < count; i++) {
    const r = random();
    let cause = 'unknown';
    let code = 'UPI_ERR_999';
    let msg = 'Generic system error';
    
    if (r < 0.38) {
      cause = 'low_balance';
      code = random() > 0.5 ? 'UPI_INSUFFICIENT_FUNDS' : 'PYMT_BAL_LOW';
      msg = 'Debit failed due to insufficient funds in customer bank account.';
    } else if (r < 0.62) {
      cause = 'bank_offline';
      code = random() > 0.5 ? 'BK_SYSTEM_OFFLINE' : 'UPI_BANK_TIMEOUT';
      msg = 'The destination bank system is currently unavailable or timed out.';
    } else if (r < 0.82) {
      cause = 'expired_mandate';
      code = random() > 0.5 ? 'UPI_MANDATE_EXPIRED' : 'PYMT_MAND_VALIDITY_OVER';
      msg = 'The e-mandate validity period has expired.';
    } else if (r < 0.96) {
      cause = 'limit_exceeded';
      code = random() > 0.5 ? 'UPI_LIMIT_EXCEEDED' : 'PYMT_DAILY_LIMIT';
      msg = 'Transaction amount exceeds the customer account limit or UPI limit.';
    } else {
      cause = 'wrong_debit_date';
      code = 'UPI_WRONG_DATE';
      msg = 'Debit attempted on a date not permitted by the mandate frequency.';
    }
    
    distribution[cause] = (distribution[cause] || 0) + 1;
    
    const id = `txn_${datasetId}_${String(i + 1).padStart(5, '0')}`;
    const customer_id = `cust_${datasetId}_${Math.floor(random() * 80) + 1}`;
    const mandate_id = `mand_${datasetId}_${Math.floor(random() * 99999)}`;
    const bank_name = BANKS[Math.floor(random() * BANKS.length)];
    const subscription_type = SUBSCRIPTIONS[Math.floor(random() * SUBSCRIPTIONS.length)];
    
    let amount = 99;
    if (random() > 0.3) {
      amount = Math.floor(99 + Math.pow(random(), 2) * 14901);
    } else {
      amount = Math.floor(99 + random() * 900);
    }
    totalAtRisk += amount;
    
    const daysAgo = random() * 30;
    const failed_at = new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    
    // Past success rate & timing
    let past_success_rate = 0.85;
    let avg_balance_pattern: 'normal' | 'low' | 'erratic' = 'normal';
    let payment_timing: 'on_time' | 'late' | 'very_late' = 'on_time';
    
    if (cause === 'low_balance') {
      past_success_rate = 0.2 + random() * 0.4;
      avg_balance_pattern = random() > 0.4 ? 'low' : 'erratic';
      payment_timing = random() > 0.5 ? 'late' : 'very_late';
    } else if (cause === 'bank_offline') {
      past_success_rate = 0.8 + random() * 0.2;
    } else if (cause === 'expired_mandate') {
      past_success_rate = 0.9 + random() * 0.1;
    }
    
    // Guardrail hits injection
    const opt_out = random() < 0.05; // 5% opt-out
    const recent_nudges_count = Math.floor(random() * 5); // Some over cap of 3
    const past_retry_attempts = Math.floor(random() * 5); // Some over cap of 3
    
    txs.push({
      id,
      customer_id,
      amount,
      currency: 'INR',
      mandate_id,
      bank_name,
      error_code: code,
      error_message: msg,
      failed_at,
      subscription_type,
      customer_payment_history: {
        past_success_rate,
        avg_balance_pattern,
        payment_timing,
        opt_out,
        recent_nudges_count,
        past_retry_attempts
      }
    });
  }
  
  return { txs, distribution, totalAtRisk };
}
