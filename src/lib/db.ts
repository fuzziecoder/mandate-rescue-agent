import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';

// Types matching database schema
export interface Transaction {
  id: string;
  customer_id: string;
  amount: number;
  currency: string;
  mandate_id: string;
  bank_name: string;
  error_code: string;
  error_message: string;
  failed_at: string;
  customer_payment_history: {
    past_success_rate: number;
    avg_balance_pattern: 'normal' | 'low' | 'erratic';
    payment_timing?: 'on_time' | 'late' | 'very_late';
    opt_out?: boolean;
    recent_nudges_count?: number;
    past_retry_attempts?: number;
  };
  subscription_type: string;
  metadata?: {
    opted_out?: boolean;
    nudge_count?: number;
    [key: string]: any;
  };
}

export interface Classification {
  transaction_id: string;
  predicted_cause?: 'insufficient_balance' | 'bank_downtime' | 'mandate_expired' | 'limit_exceeded' | 'unknown' | string;
  cause?: string;
  confidence: number;
  reasoning_text?: string;
  reasoning?: string;
  method: 'rule' | 'llm' | 'puter_ai_assist' | string;
  manual_review_required?: boolean;
  reviewed_by_user?: boolean;
  llm_called?: boolean;
  llm_provider?: string;
  llm_model?: string;
  updated_at?: string;
}

export interface Decision {
  id?: string;
  transaction_id: string;
  batch_id?: string;
  action?: 'nudge' | 'other' | string;
  chosen_action: 'retry' | 'nudge' | 'reauth' | 'stop' | 'other' | string;
  reason?: string;
  reasoning_text: string;
  confidence?: number;
  stop_reason?: string | null;
  metadata?: {
    channel?: 'whatsapp' | 'sms' | 'email' | string;
    [key: string]: any;
  };
  created_at?: string;
}

export interface GuardrailCheck {
  id?: number;
  transaction_id: string;
  check_name: 'retry_cap' | 'quiet_hours' | 'opt_out' | 'max_contacts';
  passed: boolean;
  detail: string;
}

export interface Execution {
  id?: string;
  transaction_id: string;
  batch_id?: string;
  action?: 'nudge' | string;
  action_taken?: string;
  outcome: 'recovered' | 'still_failed' | 'pending' | 'stopped' | 'Recovered' | 'Pending' | 'Failed' | 'Stopped' | string;
  amount_recovered?: number;
  recovered_amount?: number;
  executed_at?: string;
  created_at?: string;
  timestamp?: string;
  stop_reason?: string | null;
  details?: {
    nudge_sent?: boolean;
    channel?: 'whatsapp' | 'sms' | 'email' | string;
    message_type?: string;
    sent_at?: string;
    [key: string]: any;
  };
}

export interface AuditLog {
  id?: number | string;
  transaction_id: string;
  stage: string;
  payload?: any;
  detail?: string;
  event_type?: string;
  created_at?: string;
  timestamp?: string;
}

export interface AuditLogEntry {
  id?: number | string;
  transaction_id: string;
  stage: string;
  event_type?: string;
  review_action?: string;
  suggested_cause?: string;
  suggested_confidence?: number;
  suggested_reasoning?: string;
  provider?: string;
  model?: string;
  applied?: boolean;
  detail?: string;
  payload?: any;
  created_at?: string;
  timestamp?: string;
}

export interface PromiseRecord {
  id?: string;
  transaction_id: string;
  promised_date: string;
  amount: number;
  status: 'pending' | 'kept' | 'broken';
  source: 'SMS' | 'WhatsApp' | 'voice';
  notes?: string;
  created_at?: string;
}

export interface LedgerEntry {
  id?: string;
  transaction_id: string;
  idempotency_key?: string;
  amount: number;
  currency?: string;
  failure_cause?: string;
  root_cause?: string;
  recovery_action?: string;
  recovery_action_used?: string;
  channel?: string;
  provider_event_id?: string | null;
  posted_at?: string;
  timestamp?: string;
  source?: string;
  status?: string;
  confidence?: number;
}

export interface GlobalSettings {
  pause_outgoing_contacts: boolean;
  dataset_generation_version?: number;
}

export interface SettingsRecord {
  dispatch_kill_switch: boolean;
  updated_at: string | null;
  updated_by: string;
  dataset_generation_version?: number;
  dataset_metadata?: any;
}

export interface BatchRunRecord {
  id: string;
  source: 'synthetic_script' | 'dashboard' | 'razorpay_fixture' | string;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'nothing_to_process';
  started_at: string;
  completed_at: string | null;
  total: number;
  total_selected?: number;
  total_eligible?: number;
  skipped_recovered?: number;
  skipped_stopped?: number;
  skipped_failed?: number;
  skipped_other?: number;
  processed: number;
  recovered_count: number;
  stopped_count: number;
  pending_count: number;
  failed_count: number;
  total_at_risk: number;
  total_recovered: number;
  error_message: string | null;
  blocked_count?: number;
  recovery_rate?: number;
  last_processed_transaction_id?: string | null;
  current_stage?: string;
  recent_events?: string[];
  updated_at?: string;
}

// Database Connection Clients
let pgPool: Pool | null = null;
let supabaseClient: any = null;

// Determine connection strategy (default to local data/db.json unless explicitly forced)
const useRemoteDb = process.env.USE_REMOTE_DB === 'true';
const dbUrl = useRemoteDb ? process.env.DATABASE_URL : undefined;
const supabaseUrl = useRemoteDb ? process.env.NEXT_PUBLIC_SUPABASE_URL : undefined;
const supabaseKey = useRemoteDb ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined;

if (dbUrl) {
  pgPool = new Pool({ connectionString: dbUrl });
} else if (supabaseUrl && supabaseKey) {
  supabaseClient = createClient(supabaseUrl, supabaseKey);
}

// JSON Fallback DB Path helper
export function getJsonDbPath(): string {
  const customPath = process.env.MANDATE_RESCUE_DB_PATH || process.env.DB_FILE_PATH;
  if (customPath) {
    return path.isAbsolute(customPath)
      ? customPath
      : path.join(process.cwd(), customPath);
  }
  return path.join(process.cwd(), 'data', 'db.json');
}

// Helper to ensure JSON DB structure exists
function initJsonDb() {
  const targetPath = getJsonDbPath();
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const defaultSettings: SettingsRecord = {
    dispatch_kill_switch: true,
    updated_at: null,
    updated_by: 'system',
    dataset_generation_version: 1,
  };

  if (!fs.existsSync(targetPath)) {
    const initialData = {
      transactions: [],
      classifications: [],
      decisions: [],
      guardrail_checks: [],
      executions: [],
      audit_log: [],
      promises: [],
      ledger: [],
      settings: defaultSettings,
      webhook_receipts: [],
      batch_runs: [],
    };
    fs.writeFileSync(targetPath, JSON.stringify(initialData, null, 2), 'utf8');
  } else {
    // Read and merge any missing fields safely
    try {
      const current = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
      let modified = false;
      if (!Array.isArray(current.transactions)) { current.transactions = []; modified = true; }
      if (!Array.isArray(current.classifications)) { current.classifications = []; modified = true; }
      if (!Array.isArray(current.decisions)) { current.decisions = []; modified = true; }
      if (!Array.isArray(current.guardrail_checks)) { current.guardrail_checks = []; modified = true; }
      if (!Array.isArray(current.executions)) { current.executions = []; modified = true; }
      if (!Array.isArray(current.audit_log)) { current.audit_log = []; modified = true; }
      if (!Array.isArray(current.promises)) { current.promises = []; modified = true; }
      if (!Array.isArray(current.ledger)) { current.ledger = []; modified = true; }
      if (!Array.isArray(current.webhook_receipts)) { current.webhook_receipts = []; modified = true; }
      if (!Array.isArray(current.batch_runs)) { current.batch_runs = []; modified = true; }
      if (!current.settings || typeof current.settings !== 'object') {
        current.settings = defaultSettings;
        modified = true;
      } else {
        if (typeof current.settings.dispatch_kill_switch !== 'boolean') {
          if (typeof (current.settings as any).pause_outgoing_contacts === 'boolean') {
            current.settings.dispatch_kill_switch = (current.settings as any).pause_outgoing_contacts;
          } else {
            current.settings.dispatch_kill_switch = true;
          }
          modified = true;
        }
        if (!('updated_at' in current.settings)) { current.settings.updated_at = null; modified = true; }
        if (!('updated_by' in current.settings)) { current.settings.updated_by = 'system'; modified = true; }
      }
      if (modified) {
        fs.writeFileSync(targetPath, JSON.stringify(current, null, 2), 'utf8');
      }
    } catch (e) {
      console.error('Failed to parse existing JSON DB during init:', e);
    }
  }
}

// Helper to read JSON DB
function readJsonDb(): any {
  initJsonDb();
  const targetPath = getJsonDbPath();
  try {
    const data = fs.readFileSync(targetPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    try {
      // Retry read after momentary Windows write lock
      const data = fs.readFileSync(targetPath, 'utf8');
      return JSON.parse(data);
    } catch (e2) {
      console.error("Failed to read local JSON DB:", error);
      return {
        transactions: [],
        classifications: [],
        decisions: [],
        guardrail_checks: [],
        executions: [],
        audit_log: [],
        promises: [],
        ledger: [],
        settings: { dispatch_kill_switch: true, updated_at: null, updated_by: 'system' },
        webhook_receipts: [],
        batch_runs: []
      };
    }
  }
}

// Helper to write JSON DB with atomic file operation
function writeJsonDb(data: any) {
  initJsonDb();
  const targetPath = getJsonDbPath();
  const content = JSON.stringify(data, null, 2);
  const tempPath = `${targetPath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.writeFileSync(tempPath, content, 'utf8');
    try {
      fs.renameSync(tempPath, targetPath);
    } catch (_) {
      fs.copyFileSync(tempPath, targetPath);
      try { fs.unlinkSync(tempPath); } catch (e) { }
    }
  } catch (_) {
    fs.writeFileSync(targetPath, content, 'utf8');
  }
}

export function readDatabase(): any {
  const db = readJsonDb();
  // Safe logging showing only collection counts and DB path
  // (Suppressed in hot loop if needed, but logging path & counts is clean)
  return db;
}

export function writeDatabase(data: any): void {
  writeJsonDb(data);
}

export async function getWebhookReceipt(providerEventId: string): Promise<any | null> {
  const db = readJsonDb();
  const receipts = db.webhook_receipts || [];
  return receipts.find((r: any) => r.provider_event_id === providerEventId) || null;
}

export async function saveWebhookReceipt(receipt: any): Promise<void> {
  const db = readJsonDb();
  if (!db.webhook_receipts) db.webhook_receipts = [];
  const idx = db.webhook_receipts.findIndex((r: any) => r.provider_event_id === receipt.provider_event_id);
  if (idx >= 0) {
    db.webhook_receipts[idx] = receipt;
  } else {
    db.webhook_receipts.push(receipt);
  }
  writeJsonDb(db);
}

export async function updateWebhookReceipt(providerEventId: string, patch: Record<string, any>): Promise<void> {
  const db = readJsonDb();
  if (!db.webhook_receipts) db.webhook_receipts = [];
  const idx = db.webhook_receipts.findIndex((r: any) => r.provider_event_id === providerEventId);
  if (idx >= 0) {
    db.webhook_receipts[idx] = { ...db.webhook_receipts[idx], ...patch };
    writeJsonDb(db);
  }
}

// Unified Database Adapter Functions
export async function clearDatabase(): Promise<void> {
  if (pgPool) {
    const client = await pgPool.connect();
    try {
      await client.query('TRUNCATE transactions, classifications, decisions, guardrail_checks, executions, audit_log CASCADE');
    } finally {
      client.release();
    }
  } else if (supabaseClient) {
    // Cascade-delete via Supabase clients (normally done via truncate or SQL panel, mimicking cascading deletes)
    await supabaseClient.from('audit_log').delete().neq('transaction_id', '');
    await supabaseClient.from('executions').delete().neq('transaction_id', '');
    await supabaseClient.from('guardrail_checks').delete().neq('transaction_id', '');
    await supabaseClient.from('decisions').delete().neq('transaction_id', '');
    await supabaseClient.from('classifications').delete().neq('transaction_id', '');
    await supabaseClient.from('transactions').delete().neq('id', '');
  } else {
    const data = {
      transactions: [],
      classifications: [],
      decisions: [],
      guardrail_checks: [],
      executions: [],
      audit_log: [],
    };
    writeJsonDb(data);
  }
}

export async function saveTransactions(txs: Transaction[]): Promise<void> {
  if (pgPool) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');
      for (const tx of txs) {
        await client.query(
          `INSERT INTO transactions (id, customer_id, amount, currency, mandate_id, bank_name, error_code, error_message, failed_at, customer_payment_history, subscription_type) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET 
             customer_id = EXCLUDED.customer_id, 
             amount = EXCLUDED.amount,
             error_code = EXCLUDED.error_code,
             error_message = EXCLUDED.error_message,
             customer_payment_history = EXCLUDED.customer_payment_history`,
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
            JSON.stringify(tx.customer_payment_history),
            tx.subscription_type,
          ]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } else if (supabaseClient) {
    const { error } = await supabaseClient.from('transactions').upsert(
      txs.map(tx => ({
        ...tx,
        customer_payment_history: tx.customer_payment_history,
      }))
    );
    if (error) throw error;
  } else {
    const db = readJsonDb();
    txs.forEach(tx => {
      const idx = db.transactions.findIndex((t: any) => t.id === tx.id);
      if (idx >= 0) {
        db.transactions[idx] = tx;
      } else {
        db.transactions.push(tx);
      }
    });
    writeJsonDb(db);
  }
}

export async function getTransactions(): Promise<Transaction[]> {
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM transactions ORDER BY failed_at DESC');
    return res.rows.map(row => ({
      ...row,
      amount: parseFloat(row.amount),
    }));
  } else if (supabaseClient) {
    const { data, error } = await supabaseClient.from('transactions').select('*').order('failed_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } else {
    const db = readJsonDb();
    return [...db.transactions].sort((a: any, b: any) => new Date(b.failed_at).getTime() - new Date(a.failed_at).getTime());
  }
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM transactions WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      ...row,
      amount: parseFloat(row.amount),
    };
  } else if (supabaseClient) {
    const { data, error } = await supabaseClient.from('transactions').select('*').eq('id', id).single();
    if (error) return null;
    return data;
  } else {
    const db = readJsonDb();
    const tx = db.transactions.find((t: any) => t.id === id);
    return tx || null;
  }
}

export async function incrementTransactionNudgeCount(transactionId: string): Promise<void> {
  if (pgPool) {
    await pgPool.query(
      `UPDATE transactions 
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb), 
         '{nudge_count}', 
         (COALESCE((metadata->>'nudge_count')::int, 0) + 1)::text::jsonb
       )
       WHERE id = $1`,
      [transactionId]
    );
  } else if (supabaseClient) {
    const { data: tx } = await supabaseClient.from('transactions').select('metadata').eq('id', transactionId).single();
    const meta = tx?.metadata || {};
    meta.nudge_count = (meta.nudge_count || 0) + 1;
    await supabaseClient.from('transactions').update({ metadata: meta }).eq('id', transactionId);
  } else {
    const db = readJsonDb();
    const tx = db.transactions.find((t: any) => t.id === transactionId);
    if (tx) {
      if (!tx.metadata) tx.metadata = {};
      tx.metadata.nudge_count = (tx.metadata.nudge_count || 0) + 1;
      if (tx.customer_payment_history) {
        tx.customer_payment_history.recent_nudges_count = (tx.customer_payment_history.recent_nudges_count || 0) + 1;
      }
      writeJsonDb(db);
    }
  }
}

export async function saveClassification(cls: Classification): Promise<void> {
  if (pgPool) {
    await pgPool.query(
      `INSERT INTO classifications (transaction_id, predicted_cause, confidence, reasoning_text, method) 
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (transaction_id) DO UPDATE SET 
         predicted_cause = EXCLUDED.predicted_cause,
         confidence = EXCLUDED.confidence,
         reasoning_text = EXCLUDED.reasoning_text,
         method = EXCLUDED.method`,
      [cls.transaction_id, cls.predicted_cause, cls.confidence, cls.reasoning_text, cls.method]
    );
  } else if (supabaseClient) {
    const { error } = await supabaseClient.from('classifications').upsert(cls);
    if (error) throw error;
  } else {
    const db = readJsonDb();
    const idx = db.classifications.findIndex((c: any) => c.transaction_id === cls.transaction_id);
    if (idx >= 0) {
      db.classifications[idx] = cls;
    } else {
      db.classifications.push(cls);
    }
    writeJsonDb(db);
  }
}

export async function saveDecision(dec: Decision): Promise<void> {
  if (pgPool) {
    await pgPool.query(
      `INSERT INTO decisions (transaction_id, chosen_action, reasoning_text, stop_reason) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (transaction_id) DO UPDATE SET 
         chosen_action = EXCLUDED.chosen_action,
         reasoning_text = EXCLUDED.reasoning_text,
         stop_reason = EXCLUDED.stop_reason`,
      [dec.transaction_id, dec.chosen_action, dec.reasoning_text, dec.stop_reason || null]
    );
  } else if (supabaseClient) {
    const { error } = await supabaseClient.from('decisions').upsert(dec);
    if (error) throw error;
  } else {
    const db = readJsonDb();
    const idx = db.decisions.findIndex((d: any) => d.transaction_id === dec.transaction_id);
    if (idx >= 0) {
      db.decisions[idx] = dec;
    } else {
      db.decisions.push(dec);
    }
    writeJsonDb(db);
  }
}

export async function saveGuardrailCheck(check: GuardrailCheck): Promise<void> {
  if (pgPool) {
    await pgPool.query(
      `INSERT INTO guardrail_checks (transaction_id, check_name, passed, detail) 
       VALUES ($1, $2, $3, $4)`,
      [check.transaction_id, check.check_name, check.passed, check.detail]
    );
  } else if (supabaseClient) {
    const { error } = await supabaseClient.from('guardrail_checks').insert(check);
    if (error) throw error;
  } else {
    const db = readJsonDb();
    // Simulate auto-increment ID
    const nextId = db.guardrail_checks.length > 0 ? Math.max(...db.guardrail_checks.map((g: any) => g.id || 0)) + 1 : 1;
    db.guardrail_checks.push({ ...check, id: nextId });
    writeJsonDb(db);
  }
}

export async function saveExecution(exec: Execution): Promise<void> {
  if (pgPool) {
    await pgPool.query(
      `INSERT INTO executions (transaction_id, action_taken, outcome, amount_recovered, executed_at, stop_reason) 
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (transaction_id) DO UPDATE SET 
         action_taken = EXCLUDED.action_taken,
         outcome = EXCLUDED.outcome,
         amount_recovered = EXCLUDED.amount_recovered,
         executed_at = EXCLUDED.executed_at,
         stop_reason = EXCLUDED.stop_reason`,
      [exec.transaction_id, exec.action_taken, exec.outcome, exec.amount_recovered, exec.executed_at, exec.stop_reason || null]
    );
  } else if (supabaseClient) {
    const { error } = await supabaseClient.from('executions').upsert(exec);
    if (error) throw error;
  } else {
    const db = readJsonDb();
    const idx = db.executions.findIndex((e: any) => e.transaction_id === exec.transaction_id);
    if (idx >= 0) {
      db.executions[idx] = exec;
    } else {
      db.executions.push(exec);
    }
    writeJsonDb(db);
  }
}

export async function saveAuditLog(log: AuditLog): Promise<void> {
  if (pgPool) {
    await pgPool.query(
      `INSERT INTO audit_log (transaction_id, stage, payload, created_at) 
       VALUES ($1, $2, $3, $4)`,
      [log.transaction_id, log.stage, JSON.stringify(log.payload), log.created_at]
    );
  } else if (supabaseClient) {
    const { error } = await supabaseClient.from('audit_log').insert({
      transaction_id: log.transaction_id,
      stage: log.stage,
      payload: log.payload,
      created_at: log.created_at,
    });
    if (error) throw error;
  } else {
    const db = readJsonDb();
    const nextId = db.audit_log.length > 0 ? Math.max(...db.audit_log.map((a: any) => a.id || 0)) + 1 : 1;
    db.audit_log.push({ ...log, id: nextId });
    writeJsonDb(db);
  }
}

export interface PipelineTrace {
  transaction: Transaction;
  classification: Classification | null;
  decision: Decision | null;
  guardrails: GuardrailCheck[];
  execution: Execution | null;
  auditLogs: AuditLog[];
}

export async function getPipelineTrace(txnId: string): Promise<PipelineTrace | null> {
  const transaction = await getTransaction(txnId);
  if (!transaction) return null;

  if (pgPool) {
    const cls = await pgPool.query('SELECT * FROM classifications WHERE transaction_id = $1', [txnId]);
    const dec = await pgPool.query('SELECT * FROM decisions WHERE transaction_id = $1', [txnId]);
    const gd = await pgPool.query('SELECT * FROM guardrail_checks WHERE transaction_id = $1 ORDER BY id ASC', [txnId]);
    const ex = await pgPool.query('SELECT * FROM executions WHERE transaction_id = $1', [txnId]);
    const logs = await pgPool.query('SELECT * FROM audit_log WHERE transaction_id = $1 ORDER BY created_at ASC, id ASC', [txnId]);

    return {
      transaction,
      classification: cls.rows[0] || null,
      decision: dec.rows[0] || null,
      guardrails: gd.rows,
      execution: ex.rows[0] ? {
        ...ex.rows[0],
        amount_recovered: parseFloat(ex.rows[0].amount_recovered),
      } : null,
      auditLogs: logs.rows,
    };
  } else if (supabaseClient) {
    const { data: cls } = await supabaseClient.from('classifications').select('*').eq('transaction_id', txnId).maybeSingle();
    const { data: dec } = await supabaseClient.from('decisions').select('*').eq('transaction_id', txnId).maybeSingle();
    const { data: gd } = await supabaseClient.from('guardrail_checks').select('*').eq('transaction_id', txnId).order('id', { ascending: true });
    const { data: ex } = await supabaseClient.from('executions').select('*').eq('transaction_id', txnId).maybeSingle();
    const { data: logs } = await supabaseClient.from('audit_log').select('*').eq('transaction_id', txnId).order('created_at', { ascending: true });

    return {
      transaction,
      classification: cls,
      decision: dec,
      guardrails: gd || [],
      execution: ex,
      auditLogs: logs || [],
    };
  } else {
    const db = readJsonDb();
    const classification = db.classifications.find((c: any) => c.transaction_id === txnId) || null;
    const decision = db.decisions.find((d: any) => d.transaction_id === txnId) || null;
    const guardrails = db.guardrail_checks.filter((g: any) => g.transaction_id === txnId);
    const execution = db.executions.find((e: any) => e.transaction_id === txnId) || null;
    const auditLogs = db.audit_log.filter((a: any) => a.transaction_id === txnId).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    return {
      transaction,
      classification,
      decision,
      guardrails,
      execution,
      auditLogs,
    };
  }
}

export interface BatchMetrics {
  totalAtRisk: number;
  totalRecovered: number;
  recoveryRate: number;
  recoveredCount: number;
  failedCount: number;
  pendingCount: number;
  stoppedCount: number;
  falsePositiveCostCount: number;
  falsePositiveCostAmount: number;
  causeRecovery: {
    [key: string]: {
      atRisk: number;
      recovered: number;
      recoveryRate: number;
      totalCount: number;
      recoveredCount: number;
    }
  };
  totalCount: number;
}

export async function getBatchMetrics(): Promise<BatchMetrics> {
  const txs = await getTransactions();
  let totalAtRisk = 0;
  let totalRecovered = 0;
  let recoveredCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  let stoppedCount = 0;

  // Track false-positive costs: nudges sent to users who did NOT recover.
  // We define nudge cost as: if chosen_action was 'nudge' and final outcome was still_failed or stopped.
  // Wait, let's look at amount or count. The prompt says "False-positive cost callout: nudges sent to customers who never recovered (show ₹ or count 'cost' of this)".
  // Let's assume a message nudge has a processing / annoyance cost (e.g. ₹5 per nudge, or let's measure total amount of the transaction, or simply count them and show ₹ transaction volume that was nudged but not recovered).
  // Showing both count and ₹ transaction volume at risk that failed despite nudges is extremely premium and data-dense! Let's do that.
  let falsePositiveCostCount = 0;
  let falsePositiveCostAmount = 0;

  const causeRecovery: { [key: string]: any } = {
    low_balance: { atRisk: 0, recovered: 0, totalCount: 0, recoveredCount: 0 },
    insufficient_balance: { atRisk: 0, recovered: 0, totalCount: 0, recoveredCount: 0 },
    bank_offline: { atRisk: 0, recovered: 0, totalCount: 0, recoveredCount: 0 },
    bank_downtime: { atRisk: 0, recovered: 0, totalCount: 0, recoveredCount: 0 },
    expired_mandate: { atRisk: 0, recovered: 0, totalCount: 0, recoveredCount: 0 },
    mandate_expired: { atRisk: 0, recovered: 0, totalCount: 0, recoveredCount: 0 },
    limit_exceeded: { atRisk: 0, recovered: 0, totalCount: 0, recoveredCount: 0 },
    unknown: { atRisk: 0, recovered: 0, totalCount: 0, recoveredCount: 0 },
    unclassified: { atRisk: 0, recovered: 0, totalCount: 0, recoveredCount: 0 },
  };

  for (const tx of txs) {
    const trace = await getPipelineTrace(tx.id);
    totalAtRisk += tx.amount;

    const cause = trace?.classification?.predicted_cause || 'unclassified';
    const outcome = trace?.execution?.outcome || 'pending';
    const action = trace?.decision?.chosen_action;
    const recAmt = trace?.execution?.amount_recovered || 0;

    totalRecovered += recAmt;

    // Increment status counters
    if (outcome === 'recovered') {
      recoveredCount++;
    } else if (outcome === 'still_failed') {
      failedCount++;
    } else if (outcome === 'stopped') {
      stoppedCount++;
    } else {
      // Pending
      pendingCount++;
    }

    // Cause breakdown
    if (!causeRecovery[cause]) {
      causeRecovery[cause] = { atRisk: 0, recovered: 0, totalCount: 0, recoveredCount: 0 };
    }
    causeRecovery[cause].atRisk += tx.amount;
    causeRecovery[cause].recovered += recAmt;
    causeRecovery[cause].totalCount++;
    if (outcome === 'recovered') {
      causeRecovery[cause].recoveredCount++;
    }

    // False-positive nudges check:
    // If we sent a nudge, but the customer didn't pay (still_failed or stopped or remains pending)
    if (action === 'nudge' && outcome !== 'recovered') {
      falsePositiveCostCount++;
      falsePositiveCostAmount += tx.amount;
    }
  }

  // Calculate recovery rates
  const recoveryRate = totalAtRisk > 0 ? (totalRecovered / totalAtRisk) * 100 : 0;

  Object.keys(causeRecovery).forEach(key => {
    const c = causeRecovery[key];
    c.recoveryRate = c.atRisk > 0 ? (c.recovered / c.atRisk) * 100 : 0;
  });

  return {
    totalAtRisk,
    totalRecovered,
    recoveryRate,
    recoveredCount,
    failedCount,
    pendingCount,
    stoppedCount,
    falsePositiveCostCount,
    falsePositiveCostAmount,
    causeRecovery,
    totalCount: txs.length,
  };
}

let schemaEnsured = false;
async function ensureSchema() {
  if (!pgPool || schemaEnsured) return;
  try {
    const client = await pgPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS promises (
          id VARCHAR(255) PRIMARY KEY,
          transaction_id VARCHAR(255) NOT NULL,
          promised_date VARCHAR(255) NOT NULL,
          amount DECIMAL(12, 2) NOT NULL,
          status VARCHAR(50) NOT NULL,
          source VARCHAR(50) NOT NULL,
          notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS ledger (
          id VARCHAR(255) PRIMARY KEY,
          transaction_id VARCHAR(255) UNIQUE NOT NULL,
          amount DECIMAL(12, 2) NOT NULL,
          root_cause VARCHAR(100) NOT NULL,
          recovery_action_used VARCHAR(100) NOT NULL,
          channel VARCHAR(100) NOT NULL,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          confidence DECIMAL(3, 2) NOT NULL
        );
        CREATE TABLE IF NOT EXISTS global_settings (
          key VARCHAR(255) PRIMARY KEY,
          value JSONB NOT NULL
        );
      `);
      schemaEnsured = true;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("Failed to ensure postgres schema:", e);
  }
}

export async function savePromiseRecord(promise: PromiseRecord): Promise<void> {
  await ensureSchema();
  const id = promise.id || `PRM-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  if (pgPool) {
    await pgPool.query(
      `INSERT INTO promises (id, transaction_id, promised_date, amount, status, source, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         promised_date = EXCLUDED.promised_date,
         notes = EXCLUDED.notes`,
      [id, promise.transaction_id, promise.promised_date, promise.amount, promise.status, promise.source, promise.notes || '']
    );
  } else {
    const db = readJsonDb();
    const existingIdx = db.promises.findIndex((p: any) => p.transaction_id === promise.transaction_id || p.id === promise.id);
    const newPromise = {
      id,
      transaction_id: promise.transaction_id,
      promised_date: promise.promised_date,
      amount: promise.amount,
      status: promise.status,
      source: promise.source,
      notes: promise.notes || '',
      created_at: promise.created_at || new Date().toISOString()
    };
    if (existingIdx >= 0) {
      db.promises[existingIdx] = { ...db.promises[existingIdx], ...newPromise };
    } else {
      db.promises.push(newPromise);
    }
    writeJsonDb(db);
  }
}

export async function getPromiseRecords(): Promise<PromiseRecord[]> {
  await ensureSchema();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM promises ORDER BY promised_date ASC');
    return res.rows.map(row => ({
      ...row,
      amount: parseFloat(row.amount),
    }));
  } else {
    const db = readJsonDb();
    return db.promises || [];
  }
}

export async function getPromiseRecord(txnId: string): Promise<PromiseRecord | null> {
  await ensureSchema();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM promises WHERE transaction_id = $1', [txnId]);
    if (res.rows.length === 0) return null;
    return {
      ...res.rows[0],
      amount: parseFloat(res.rows[0].amount),
    };
  } else {
    const db = readJsonDb();
    return db.promises?.find((p: any) => p.transaction_id === txnId) || null;
  }
}

export async function saveLedgerEntry(entry: LedgerEntry): Promise<void> {
  await ensureSchema();
  const id = entry.id || `LDG-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  if (pgPool) {
    // Avoid double counting by checking conflict on transaction_id
    await pgPool.query(
      `INSERT INTO ledger (id, transaction_id, amount, root_cause, recovery_action_used, channel, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (transaction_id) DO NOTHING`,
      [id, entry.transaction_id, entry.amount, entry.root_cause, entry.recovery_action_used, entry.channel, entry.confidence]
    );
  } else {
    const db = readJsonDb();
    // Check unique transaction_id to prevent double counting
    const exists = db.ledger.some((l: any) => l.transaction_id === entry.transaction_id);
    if (!exists) {
      db.ledger.push({
        id,
        transaction_id: entry.transaction_id,
        amount: entry.amount,
        root_cause: entry.root_cause,
        recovery_action_used: entry.recovery_action_used,
        channel: entry.channel,
        timestamp: entry.timestamp || new Date().toISOString(),
        confidence: entry.confidence
      });
      writeJsonDb(db);
    }
  }
}

export async function getClassifications(): Promise<Classification[]> {
  await ensureSchema();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM classifications');
    return res.rows;
  } else {
    const db = readJsonDb();
    return db.classifications || [];
  }
}

export async function getDecisions(): Promise<Decision[]> {
  await ensureSchema();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM decisions');
    return res.rows;
  } else {
    const db = readJsonDb();
    return db.decisions || [];
  }
}

export async function getGuardrailChecks(): Promise<GuardrailCheck[]> {
  await ensureSchema();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM guardrail_checks ORDER BY id ASC');
    return res.rows;
  } else {
    const db = readJsonDb();
    return db.guardrail_checks || [];
  }
}

export async function getExecutions(): Promise<Execution[]> {
  await ensureSchema();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM executions');
    return res.rows.map(row => ({
      ...row,
      amount_recovered: parseFloat(row.amount_recovered),
    }));
  } else {
    const db = readJsonDb();
    return db.executions || [];
  }
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  await ensureSchema();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM audit_log ORDER BY created_at DESC');
    return res.rows;
  } else {
    const db = readJsonDb();
    return db.audit_log || [];
  }
}

export async function getLedgerEntries(): Promise<LedgerEntry[]> {
  await ensureSchema();
  if (pgPool) {
    const res = await pgPool.query('SELECT * FROM ledger ORDER BY timestamp DESC');
    return res.rows.map(row => ({
      ...row,
      amount: parseFloat(row.amount),
      confidence: parseFloat(row.confidence),
    }));
  } else {
    const db = readJsonDb();
    return db.ledger || [];
  }
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  await ensureSchema();
  if (pgPool) {
    const res = await pgPool.query("SELECT value FROM global_settings WHERE key = 'config'");
    if (res.rows.length === 0) {
      return { pause_outgoing_contacts: false };
    }
    return res.rows[0].value;
  } else {
    const db = readJsonDb();
    return db.settings || { pause_outgoing_contacts: false };
  }
}

export async function saveGlobalSettings(settings: GlobalSettings): Promise<void> {
  await ensureSchema();
  if (pgPool) {
    await pgPool.query(
      `INSERT INTO global_settings (key, value)
       VALUES ('config', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(settings)]
    );
  } else {
    const db = readJsonDb();
    db.settings = settings;
    writeJsonDb(db);
  }
}

export async function getTransactionById(transactionId: string): Promise<Transaction | null> {
  const txs = await getTransactions();
  const found = txs.find((tx) => tx.id === transactionId);
  return found || null;
}

export async function getClassificationByTransactionId(transactionId: string): Promise<Classification | null> {
  const list = await getClassifications();
  const found = list.find((c) => c.transaction_id === transactionId);
  return found || null;
}

export async function upsertClassification(classification: Classification): Promise<Classification> {
  await saveClassification(classification);
  return classification;
}

export async function appendAuditLog(auditEvent: AuditLogEntry): Promise<AuditLogEntry> {
  const logToSave: AuditLog = {
    id: auditEvent.id || `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    transaction_id: auditEvent.transaction_id,
    stage: auditEvent.stage || 'ai_tiebreak_review',
    event_type: auditEvent.event_type,
    detail: auditEvent.detail || (auditEvent.payload ? JSON.stringify(auditEvent.payload) : undefined),
    payload: auditEvent.payload || { ...auditEvent },
    created_at: auditEvent.created_at || auditEvent.timestamp || new Date().toISOString(),
    timestamp: auditEvent.timestamp || auditEvent.created_at || new Date().toISOString(),
  };

  await saveAuditLog(logToSave);
  return {
    ...auditEvent,
    id: logToSave.id,
    created_at: logToSave.created_at,
    timestamp: logToSave.timestamp,
  };
}

export async function getSettings(): Promise<SettingsRecord> {
  const db = readJsonDb();
  const settings = db.settings || {};
  return {
    dispatch_kill_switch: typeof settings.dispatch_kill_switch === 'boolean' ? settings.dispatch_kill_switch : true,
    updated_at: settings.updated_at || null,
    updated_by: settings.updated_by || 'system',
  };
}

export async function updateSettings(patch: Partial<SettingsRecord>): Promise<SettingsRecord> {
  const db = readJsonDb();
  const current = await getSettings();
  const updated: SettingsRecord = {
    ...current,
    ...patch,
    updated_at: patch.updated_at !== undefined ? patch.updated_at : new Date().toISOString(),
    updated_by: patch.updated_by !== undefined ? patch.updated_by : 'dashboard',
  };
  db.settings = updated;
  writeJsonDb(db);
  return updated;
}

export async function getAllTransactions(): Promise<Transaction[]> {
  return getTransactions();
}

export async function saveTransaction(tx: Transaction): Promise<void> {
  await saveTransactions([tx]);
}

export async function createBatchRun(input: Partial<BatchRunRecord>): Promise<BatchRunRecord> {
  const db = readJsonDb();
  if (!db.batch_runs) db.batch_runs = [];
  const newRun: BatchRunRecord = {
    id: input.id || `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    source: input.source || 'dashboard',
    status: input.status || 'queued',
    started_at: input.started_at || new Date().toISOString(),
    completed_at: input.completed_at || null,
    total: input.total || 0,
    processed: input.processed || 0,
    recovered_count: input.recovered_count || 0,
    stopped_count: input.stopped_count || 0,
    pending_count: input.pending_count || 0,
    failed_count: input.failed_count || 0,
    total_at_risk: input.total_at_risk || 0,
    total_recovered: input.total_recovered || 0,
    error_message: input.error_message || null,
    blocked_count: input.blocked_count || 0,
    recovery_rate: input.recovery_rate || 0,
    last_processed_transaction_id: input.last_processed_transaction_id || null,
    current_stage: input.current_stage || 'idle',
    recent_events: input.recent_events || [],
    updated_at: input.updated_at || new Date().toISOString(),
  };
  db.batch_runs.push(newRun);
  writeJsonDb(db);
  return newRun;
}

export async function getBatchRunById(batchId: string): Promise<BatchRunRecord | null> {
  const db = readJsonDb();
  const runs = db.batch_runs || [];
  return runs.find((r: BatchRunRecord) => r.id === batchId) || null;
}

export async function getLatestBatchRun(): Promise<BatchRunRecord | null> {
  const db = readJsonDb();
  const runs = db.batch_runs || [];
  if (runs.length === 0) return null;
  return runs[runs.length - 1];
}

export async function updateBatchRun(batchId: string, patch: Partial<BatchRunRecord>): Promise<BatchRunRecord | null> {
  const db = readJsonDb();
  if (!db.batch_runs) db.batch_runs = [];
  const idx = db.batch_runs.findIndex((r: BatchRunRecord) => r.id === batchId);
  if (idx < 0) return null;
  const updated = { ...db.batch_runs[idx], ...patch };
  db.batch_runs[idx] = updated;
  writeJsonDb(db);
  return updated;
}

export async function getExecutionByTransactionId(transactionId: string): Promise<Execution | null> {
  const execs = await getExecutions();
  return execs.find(e => e.transaction_id === transactionId) || null;
}

export async function saveExecutionOrUpsert(exec: Execution): Promise<void> {
  return saveExecution(exec);
}

export async function saveClassificationOrUpsert(cls: Classification): Promise<void> {
  return saveClassification(cls);
}

export async function saveDecisionOrUpsert(dec: Decision): Promise<void> {
  return saveDecision(dec);
}

export async function saveLedgerEntryOnce(entry: LedgerEntry): Promise<{ entry: LedgerEntry; inserted: boolean; duplicate: boolean; reason?: string }> {
  await ensureSchema();
  const txId = entry.transaction_id;
  const idempotencyKey = entry.idempotency_key || `recovery:${txId}`;

  if (!txId) {
    throw new Error('Cannot save ledger entry: missing transaction_id.');
  }
  if (typeof entry.amount !== 'number' || isNaN(entry.amount) || !isFinite(entry.amount) || entry.amount <= 0) {
    throw new Error(`Cannot save ledger entry: invalid recovery amount ${entry.amount}. Must be > 0.`);
  }

  if (pgPool) {
    const checkRes = await pgPool.query(
      'SELECT * FROM ledger WHERE transaction_id = $1 OR idempotency_key = $2 LIMIT 1',
      [txId, idempotencyKey]
    );
    if (checkRes.rows.length > 0) {
      const row = checkRes.rows[0];
      return {
        entry: { ...row, amount: parseFloat(row.amount), confidence: parseFloat(row.confidence) },
        inserted: false,
        duplicate: true,
        reason: 'Duplicate recovery entry exists for transaction.',
      };
    }

    const newId = entry.id || `LDG-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
    const timestamp = entry.timestamp || entry.posted_at || new Date().toISOString();
    const insertedRes = await pgPool.query(
      `INSERT INTO ledger (id, transaction_id, idempotency_key, amount, currency, root_cause, failure_cause, recovery_action_used, recovery_action, channel, provider_event_id, timestamp, posted_at, source, status, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        newId,
        txId,
        idempotencyKey,
        entry.amount,
        entry.currency || 'INR',
        entry.root_cause || entry.failure_cause || 'unknown',
        entry.failure_cause || entry.root_cause || 'unknown',
        entry.recovery_action_used || entry.recovery_action || 'auto_retry',
        entry.recovery_action || entry.recovery_action_used || 'auto_retry',
        entry.channel || 'auto_retry',
        entry.provider_event_id || null,
        timestamp,
        timestamp,
        entry.source || 'batch_engine',
        entry.status || 'recovered',
        entry.confidence || 0.95,
      ]
    );
    return {
      entry: insertedRes.rows[0],
      inserted: true,
      duplicate: false,
    };
  } else {
    // Atomic read-check-write in local DB
    const db = readJsonDb();
    if (!db.ledger) db.ledger = [];

    const existingIndex = db.ledger.findIndex(
      (e: any) => e.transaction_id === txId || e.idempotency_key === idempotencyKey
    );

    if (existingIndex >= 0) {
      return {
        entry: db.ledger[existingIndex],
        inserted: false,
        duplicate: true,
        reason: 'Duplicate recovery entry exists for transaction.',
      };
    }

    const timestamp = entry.timestamp || entry.posted_at || new Date().toISOString();
    const newEntry: LedgerEntry = {
      id: entry.id || `LDG-${Math.random().toString(36).substring(2, 11).toUpperCase()}`,
      transaction_id: txId,
      idempotency_key: idempotencyKey,
      amount: entry.amount,
      currency: entry.currency || 'INR',
      root_cause: entry.root_cause || entry.failure_cause || 'unknown',
      failure_cause: entry.failure_cause || entry.root_cause || 'unknown',
      recovery_action_used: entry.recovery_action_used || entry.recovery_action || 'auto_retry',
      recovery_action: entry.recovery_action || entry.recovery_action_used || 'auto_retry',
      channel: entry.channel || 'auto_retry',
      provider_event_id: entry.provider_event_id || null,
      posted_at: timestamp,
      timestamp,
      source: entry.source || 'batch_engine',
      status: entry.status || 'recovered',
      confidence: entry.confidence || 0.95,
    };

    db.ledger.push(newEntry);
    writeJsonDb(db);

    return {
      entry: newEntry,
      inserted: true,
      duplicate: false,
    };
  }
}

export async function saveGuardrailCheckOrUpsert(check: GuardrailCheck): Promise<void> {
  return saveGuardrailCheck(check);
}

export async function getLedgerSummary() {
  const ledger = await getLedgerEntries();
  const txs = await getTransactions();
  const { calculateLedgerReconciliation } = require('./metrics');
  return calculateLedgerReconciliation(ledger, txs);
}
