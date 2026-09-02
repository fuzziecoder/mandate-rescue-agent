import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

// Types matching database schema
interface Transaction {
  id: string;
  customer_id: string;
  amount: number;
  currency: string;
  mandate_id: string;
  bank_name: string;
  error_code: string;
  error_message: string;
  failed_at: string;
  customer_payment_history: string; // JSON string for DB
  subscription_type: string;
}

const BANKS = [
  'State Bank of India',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
  'Federal Bank',
  'Bank of Baroda'
];

const SUBSCRIPTIONS = [
  'SaaS Premium Monthly',
  'Gym Membership Standard',
  'Ott streaming Annual',
  'Weekly Milk Delivery',
  'Newspaper Daily Nudge',
  'Internet Broadband Plus'
];

const ERROR_PROFILES = {
  insufficient_balance: [
    { code: 'UPI_INSUFFICIENT_FUNDS', msg: 'The account does not have sufficient balance to complete the transaction.' },
    { code: 'PYMT_BAL_LOW', msg: 'Debit failed due to insufficient funds in customer bank account.' },
  ],
  bank_downtime: [
    { code: 'BK_SYSTEM_OFFLINE', msg: 'The destination bank system is currently unavailable or timed out.' },
    { code: 'UPI_BANK_TIMEOUT', msg: 'No response from PSP bank. Transaction timed out.' },
  ],
  mandate_expired: [
    { code: 'UPI_MANDATE_EXPIRED', msg: 'The e-mandate validity period has expired.' },
    { code: 'PYMT_MAND_VALIDITY_OVER', msg: 'E-mandate date range has lapsed. Mandate inactive.' },
  ],
  limit_exceeded: [
    { code: 'UPI_LIMIT_EXCEEDED', msg: 'Transaction amount exceeds the customer account limit or UPI limit.' },
    { code: 'PYMT_DAILY_LIMIT', msg: 'Daily debit limit exceeded for this recurring profile.' },
  ],
  unknown: [
    { code: 'UPI_ERR_999', msg: 'A generic system error occurred at the gateway. Verification required.' },
    { code: 'PYMT_TECH_DECLINE', msg: 'Technical decline. PSP gateway dropped transaction.' },
    { code: 'AMBIGUOUS_REASON', msg: 'Contact customer bank. Gateway received empty payload response.' }
  ]
};

async function run() {
  console.log('Generating 300 synthetic failed transactions...');
  const txs: Transaction[] = [];
  const now = new Date();

  // Create exactly 300 transactions with requested distribution
  // 40% insufficient_balance = 120
  // 25% bank_downtime = 75
  // 20% mandate_expired = 60
  // 10% limit_exceeded = 30
  // 5% unknown = 15
  const distribution = [
    { cause: 'insufficient_balance', count: 120 },
    { cause: 'bank_downtime', count: 75 },
    { cause: 'mandate_expired', count: 60 },
    { cause: 'limit_exceeded', count: 30 },
    { cause: 'unknown', count: 15 }
  ];

  let txnIndex = 1;

  for (const item of distribution) {
    const profiles = ERROR_PROFILES[item.cause as keyof typeof ERROR_PROFILES];
    
    for (let i = 0; i < item.count; i++) {
      const id = `txn_${String(txnIndex).padStart(5, '0')}`;
      const customer_id = `cust_${String(Math.floor(Math.random() * 80) + 1).padStart(4, '0')}`;
      
      // Vary amounts: ₹99 - ₹15,000
      let amount = 99;
      if (Math.random() > 0.3) {
        // Logarithmic scale to favor lower subscription prices but still hit high ones
        amount = Math.floor(99 + Math.pow(Math.random(), 2) * 14901);
      } else {
        amount = Math.floor(99 + Math.random() * 900); // mostly smaller
      }

      const currency = 'INR';
      const mandate_id = `mand_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      const bank_name = BANKS[Math.floor(Math.random() * BANKS.length)];
      const subscription_type = SUBSCRIPTIONS[Math.floor(Math.random() * SUBSCRIPTIONS.length)];
      
      // Select error message profile
      const profile = profiles[Math.floor(Math.random() * profiles.length)];
      
      // Distribute failed_at across 30 days
      const daysAgo = Math.random() * 30;
      const failed_at = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

      // Synthesize customer history
      // History should correlate with the cause
      let past_success_rate = 0.85;
      let avg_balance_pattern: 'normal' | 'low' | 'erratic' = 'normal';
      let payment_timing: 'on_time' | 'late' | 'very_late' = 'on_time';
      
      if (item.cause === 'insufficient_balance') {
        past_success_rate = 0.2 + Math.random() * 0.4; // 20% - 60%
        avg_balance_pattern = Math.random() > 0.4 ? 'low' : 'erratic';
        payment_timing = Math.random() > 0.5 ? 'late' : 'very_late';
      } else if (item.cause === 'bank_downtime') {
        past_success_rate = 0.8 + Math.random() * 0.2; // 80% - 100%
        avg_balance_pattern = 'normal';
        payment_timing = 'on_time';
      } else if (item.cause === 'mandate_expired') {
        past_success_rate = 0.9 + Math.random() * 0.1; // expired mandates were usually paying fine before
        avg_balance_pattern = 'normal';
        payment_timing = 'on_time';
      }

      // 3% opt out rate for testing guardrail checks
      const opt_out = Math.random() < 0.03;
      // contacts count in current week
      const recent_nudges_count = Math.floor(Math.random() * 4); // 0 to 3
      // past retry attempts ever for this mandate (max 3 allowed)
      // generate some mandates close to or exceeding the cap
      const past_retry_attempts = Math.floor(Math.random() * 4); // 0 to 3

      const customer_payment_history = {
        past_success_rate,
        avg_balance_pattern,
        payment_timing,
        opt_out,
        recent_nudges_count,
        past_retry_attempts
      };

      txs.push({
        id,
        customer_id,
        amount,
        currency,
        mandate_id,
        bank_name,
        error_code: profile.code,
        error_message: profile.msg,
        failed_at,
        customer_payment_history: JSON.stringify(customer_payment_history),
        subscription_type
      });

      txnIndex++;
    }
  }

  // Save to database
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    console.log('Connecting to PostgreSQL to insert transactions...');
    const pool = new Pool({ connectionString: dbUrl });
    const client = await pool.connect();
    try {
      await client.query('TRUNCATE transactions CASCADE');
      for (const tx of txs) {
        await client.query(
          `INSERT INTO transactions (id, customer_id, amount, currency, mandate_id, bank_name, error_code, error_message, failed_at, customer_payment_history, subscription_type) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            tx.id,
            tx.customer_id,
            tx.amount,
            tx.currency,
            tx.mandate_id,
            tx.bank_name,
            tx.error_code,
            tx.error_message,
            tx.failed_at,
            tx.customer_payment_history,
            tx.subscription_type
          ]
        );
      }
      console.log('PostgreSQL insertion complete!');
    } catch (e) {
      console.error('Error inserting into Postgres:', e);
    } finally {
      client.release();
      await pool.end();
    }
  } else {
    // Save to local JSON DB
    console.log('Using local JSON database fallback...');
    const dbDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'db.json');
    
    let initialData = {
      transactions: [],
      classifications: [],
      decisions: [],
      guardrail_checks: [],
      executions: [],
      audit_log: []
    };

    if (fs.existsSync(dbPath)) {
      try {
        initialData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      } catch (e) {
        // reset if corrupted
      }
    }

    // Convert transactions customer_payment_history back to object for JSON db
    initialData.transactions = txs.map(tx => ({
      ...tx,
      amount: Number(tx.amount),
      customer_payment_history: JSON.parse(tx.customer_payment_history)
    })) as any;
    
    // Clear out pipeline stages and ledger for fresh run
    initialData.classifications = [];
    initialData.decisions = [];
    initialData.guardrail_checks = [];
    initialData.executions = [];
    initialData.audit_log = [];
    (initialData as any).ledger = [];
    (initialData as any).promises = [];

    fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2), 'utf8');
    console.log(`Local JSON file populated! Saved ${txs.length} transactions in data/db.json`);
  }
}

run().catch(console.error);
