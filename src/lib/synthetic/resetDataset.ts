import fs from 'fs';
import path from 'path';
import { getJsonDbPath, SettingsRecord } from '../db';
import { generateSyntheticTransactions } from './generateDataset';

export interface ResetDatasetOptions {
  transactionCount?: number;
  seed?: number;
  preserveSettings?: boolean;
  requestedBy: 'dashboard' | 'cli';
}

export interface ResetDatasetResult {
  datasetId: string;
  count: number;
  totalAtRisk: number;
  backupPath: string;
  generatedAt: string;
  causeDistribution: Record<string, number>;
  seed: number | null;
  dbPath: string;
}

export async function resetAndGenerateFreshDataset(options: ResetDatasetOptions): Promise<ResetDatasetResult> {
  // 1. Verify reset is allowed
  if (process.env.WEBHOOK_SIMULATION_MODE !== 'true') {
    throw new Error('Synthetic reset is disabled outside local simulation mode. (WEBHOOK_SIMULATION_MODE != "true")');
  }
  if (process.env.ALLOW_SYNTHETIC_DATA_RESET !== 'true') {
    throw new Error('Synthetic reset is disabled. (ALLOW_SYNTHETIC_DATA_RESET != "true")');
  }

  const dbPath = getJsonDbPath();
  const backupDir = path.join(path.dirname(dbPath), 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // 2. Read existing DB
  let existingDb: any = {};
  if (fs.existsSync(dbPath)) {
    try {
      existingDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
      console.warn('Failed to parse existing DB, proceeding with empty DB base', e);
    }
  }

  // 3. Pause active batches
  if (Array.isArray(existingDb.batch_runs)) {
    let pausedAny = false;
    for (const batch of existingDb.batch_runs) {
      if (['queued', 'running', 'paused'].includes(batch.status)) {
        batch.status = 'paused';
        pausedAny = true;
      }
    }
    
    // Set kill switch
    if (pausedAny) {
      if (!existingDb.settings) existingDb.settings = {};
      existingDb.settings.dispatch_kill_switch = true;
      
      // Append safe audit event
      if (!Array.isArray(existingDb.audit_log)) existingDb.audit_log = [];
      existingDb.audit_log.push({
        transaction_id: 'SYSTEM',
        stage: 'system',
        event_type: 'dataset_reset_requested_active_batch_paused',
        detail: 'Dataset reset requested while a batch was active. Batch paused and kill-switch activated prior to backup.',
        created_at: new Date().toISOString(),
      });
      
      // Sync DB before backup
      fs.writeFileSync(dbPath, JSON.stringify(existingDb, null, 2), 'utf8');
    }
  }

  // 4. Create verified backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilename = `db-before-reset-${timestamp}.json`;
  const backupPath = path.join(backupDir, backupFilename);
  
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, backupPath);
  } else {
    fs.writeFileSync(backupPath, JSON.stringify(existingDb, null, 2), 'utf8');
  }
  
  if (!fs.existsSync(backupPath) || fs.statSync(backupPath).size === 0) {
    throw new Error(`Backup failed: ${backupPath} is missing or empty. Reset aborted.`);
  }

  // 5. Generate fresh data
  const count = options.transactionCount && options.transactionCount >= 10 && options.transactionCount <= 1000 
    ? options.transactionCount 
    : 300;
  
  const seed = options.seed ?? null;
  const datasetId = `ds_${Date.now().toString(36)}`;
  
  const { txs, distribution, totalAtRisk } = generateSyntheticTransactions(count, seed, datasetId);
  
  const generatedAt = new Date().toISOString();

  // 6. Form new DB
  let newGenerationVersion = 1;
  if (existingDb.settings && typeof existingDb.settings.dataset_generation_version === 'number') {
    newGenerationVersion = existingDb.settings.dataset_generation_version + 1;
  }

  const datasetMetadata = {
    dataset_id: datasetId,
    source: 'synthetic',
    generated_at: generatedAt,
    seed,
    transaction_count: count,
    total_at_risk: totalAtRisk,
    cause_distribution: distribution,
    reset_reason: 'fresh_demo_dataset'
  };

  let newSettings: SettingsRecord = {
    dispatch_kill_switch: false, // force clear unless safety policy requires otherwise
    updated_at: generatedAt,
    updated_by: 'reset_system',
    dataset_generation_version: newGenerationVersion,
    dataset_metadata: datasetMetadata
  };

  if (options.preserveSettings && existingDb.settings) {
    newSettings = {
      ...newSettings, // overrides with the safe defaults above
      // If we wanted to preserve other flags we could map them here
      // dispatch_kill_switch is explicitly forced to false above for a fresh run
    };
  }

  const freshDb = {
    transactions: txs,
    classifications: [],
    decisions: [],
    guardrail_checks: [],
    executions: [],
    audit_log: [{
      transaction_id: 'SYSTEM',
      stage: 'system',
      event_type: 'dataset_generated',
      detail: `Generated fresh dataset ${datasetId} with ${count} transactions.`,
      created_at: generatedAt
    }],
    promises: [],
    ledger: [],
    webhook_receipts: [],
    batch_runs: [],
    settings: newSettings
  };

  // 7. Atomic Write
  const tempDbPath = `${dbPath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempDbPath, JSON.stringify(freshDb, null, 2), 'utf8');
  
  // Validate JSON was written correctly
  try {
    JSON.parse(fs.readFileSync(tempDbPath, 'utf8'));
  } catch (e) {
    fs.unlinkSync(tempDbPath);
    throw new Error('Failed to validate temp DB JSON format. Reset aborted.');
  }

  // Rename to atomic replace
  fs.renameSync(tempDbPath, dbPath);

  // 8. Return result
  return {
    datasetId,
    count: txs.length,
    totalAtRisk,
    backupPath,
    generatedAt,
    causeDistribution: distribution,
    seed,
    dbPath
  };
}
