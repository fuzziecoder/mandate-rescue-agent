/**
 * add-eligible-cases.ts
 *
 * Injects N fresh failed-mandate transactions into data/db.json with:
 *   - No execution record        → eligible for batch
 *   - No ledger entry            → eligible for batch
 *   - No classification/decision → full pipeline will run
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/add-eligible-cases.ts [count]
 *   npx ts-node -r tsconfig-paths/register scripts/add-eligible-cases.ts 50
 */

import fs from 'fs';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'data', 'db.json');
const COUNT = parseInt(process.argv[2] || '50', 10);

// ─── Realistic failure scenarios ───────────────────────────────────────────────

const SCENARIOS: Array<{
  errorCode: string;
  errorMessage: string;
  bank: string;
  balancePattern: 'normal' | 'low' | 'erratic';
  pastSuccessRate: number;
  paymentTiming: 'on_time' | 'late' | 'very_late';
  subscriptionType: string;
  amountRange: [number, number];
  optOut: boolean;
}> = [
  {
    errorCode: 'INSUFFICIENT_FUNDS',
    errorMessage: 'Debit failed due to insufficient account balance',
    bank: 'HDFC',
    balancePattern: 'low',
    pastSuccessRate: 0.72,
    paymentTiming: 'late',
    subscriptionType: 'Monthly SIP',
    amountRange: [500, 5000],
    optOut: false,
  },
  {
    errorCode: 'BANK_TECHNICAL_ERROR',
    errorMessage: 'Bank server unavailable during mandate debit window',
    bank: 'SBI',
    balancePattern: 'normal',
    pastSuccessRate: 0.91,
    paymentTiming: 'on_time',
    subscriptionType: 'Insurance Premium',
    amountRange: [1200, 8000],
    optOut: false,
  },
  {
    errorCode: 'MANDATE_EXPIRED',
    errorMessage: 'Mandate validity period has lapsed',
    bank: 'ICICI',
    balancePattern: 'normal',
    pastSuccessRate: 0.88,
    paymentTiming: 'on_time',
    subscriptionType: 'Loan EMI',
    amountRange: [3000, 25000],
    optOut: false,
  },
  {
    errorCode: 'DEBIT_LIMIT_EXCEEDED',
    errorMessage: 'Transaction amount exceeds UPI autopay limit',
    bank: 'AXIS',
    balancePattern: 'normal',
    pastSuccessRate: 0.95,
    paymentTiming: 'on_time',
    subscriptionType: 'Subscription Autopay',
    amountRange: [5000, 15000],
    optOut: false,
  },
  {
    errorCode: 'INVALID_ACCOUNT',
    errorMessage: 'Account closed or details changed since mandate registration',
    bank: 'KOTAK',
    balancePattern: 'erratic',
    pastSuccessRate: 0.55,
    paymentTiming: 'very_late',
    subscriptionType: 'OTT Subscription',
    amountRange: [200, 2000],
    optOut: false,
  },
  {
    errorCode: 'INSUFFICIENT_FUNDS',
    errorMessage: 'Account balance below required debit amount at execution time',
    bank: 'BOB',
    balancePattern: 'low',
    pastSuccessRate: 0.68,
    paymentTiming: 'late',
    subscriptionType: 'Mutual Fund SIP',
    amountRange: [1000, 10000],
    optOut: false,
  },
  {
    errorCode: 'BANK_TECHNICAL_ERROR',
    errorMessage: 'NPCI gateway timeout during recurring debit processing',
    bank: 'PNB',
    balancePattern: 'normal',
    pastSuccessRate: 0.85,
    paymentTiming: 'on_time',
    subscriptionType: 'Utility Bill',
    amountRange: [800, 4000],
    optOut: false,
  },
  {
    errorCode: 'CUSTOMER_OPT_OUT',
    errorMessage: 'Customer has revoked autopay mandate permission',
    bank: 'HDFC',
    balancePattern: 'normal',
    pastSuccessRate: 0.79,
    paymentTiming: 'on_time',
    subscriptionType: 'Subscription Autopay',
    amountRange: [299, 999],
    optOut: true,
  },
  {
    errorCode: 'INSUFFICIENT_FUNDS',
    errorMessage: 'Balance insufficient — salary not credited yet',
    bank: 'ICICI',
    balancePattern: 'low',
    pastSuccessRate: 0.82,
    paymentTiming: 'late',
    subscriptionType: 'Credit Card Autopay',
    amountRange: [2000, 50000],
    optOut: false,
  },
  {
    errorCode: 'MANDATE_CANCELLED',
    errorMessage: 'Mandate was cancelled at the bank level',
    bank: 'YES',
    balancePattern: 'erratic',
    pastSuccessRate: 0.61,
    paymentTiming: 'very_late',
    subscriptionType: 'Personal Loan EMI',
    amountRange: [5000, 30000],
    optOut: false,
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randPastDate(hoursAgo = 48): string {
  const ms = Date.now() - randInt(1, hoursAgo) * 3600_000;
  return new Date(ms).toISOString();
}

function generateTransactionId(index: number): string {
  return `txn_elig_${String(index).padStart(4, '0')}_${Date.now().toString(36)}`;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`❌  DB not found at ${DB_PATH}. Run the generator first.`);
    process.exit(1);
  }

  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

  if (!Array.isArray(db.transactions)) {
    console.error('❌  db.json missing transactions array.');
    process.exit(1);
  }

  const existingIds = new Set<string>(db.transactions.map((t: any) => t.id));
  const newTxs: any[] = [];

  for (let i = 0; i < COUNT; i++) {
    const scenario = SCENARIOS[i % SCENARIOS.length];
    const [minAmt, maxAmt] = scenario.amountRange;

    let id = generateTransactionId(i + 1);
    // Ensure uniqueness
    while (existingIds.has(id)) {
      id = generateTransactionId(randInt(1000, 9999));
    }
    existingIds.add(id);

    const nudgesCount = randInt(0, 3);
    const retryAttempts = randInt(0, 2);

    newTxs.push({
      id,
      customer_id: `cust_elig_${String(randInt(10000, 99999))}`,
      amount: randInt(minAmt, maxAmt),
      currency: 'INR',
      mandate_id: `mand_elig_${String(randInt(10000, 99999))}`,
      bank_name: scenario.bank,
      error_code: scenario.errorCode,
      error_message: scenario.errorMessage,
      failed_at: randPastDate(72),
      subscription_type: scenario.subscriptionType,
      customer_payment_history: {
        past_success_rate: randFloat(
          Math.max(0.4, scenario.pastSuccessRate - 0.15),
          Math.min(1.0, scenario.pastSuccessRate + 0.05)
        ),
        avg_balance_pattern: scenario.balancePattern,
        payment_timing: scenario.paymentTiming,
        opt_out: scenario.optOut,
        recent_nudges_count: nudgesCount,
        past_retry_attempts: retryAttempts,
      },
    });
  }

  // Append to transactions — do NOT touch executions, ledger, or audit_log
  db.transactions = [...db.transactions, ...newTxs];

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

  console.log(`\n✅  Injected ${newTxs.length} eligible transactions into ${DB_PATH}`);
  console.log(`   Total transactions now: ${db.transactions.length}`);
  console.log(`   These have NO execution records → batch engine will process them.\n`);

  // Summary by scenario
  const summary: Record<string, number> = {};
  for (const tx of newTxs) {
    summary[tx.error_code] = (summary[tx.error_code] || 0) + 1;
  }
  console.log('   Breakdown by error code:');
  for (const [code, count] of Object.entries(summary)) {
    console.log(`     ${code.padEnd(28)} ${count}`);
  }
  console.log('');
  console.log('   Now click "Run Batch Engine" on the dashboard, or run:');
  console.log('   curl -X POST http://localhost:3000/api/batch/run\n');
}

main();
