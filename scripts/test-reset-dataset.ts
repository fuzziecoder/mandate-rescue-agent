import { resetAndGenerateFreshDataset } from '../src/lib/synthetic/resetDataset';
import { getJsonDbPath } from '../src/lib/db';
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('Starting Reset Dataset Integration Tests...');

  // Setup test environment overrides
  process.env.WEBHOOK_SIMULATION_MODE = 'true';
  process.env.ALLOW_SYNTHETIC_DATA_RESET = 'true';
  
  // Use a temporary DB for tests
  const testDbName = `test-db-${Date.now()}.json`;
  process.env.MANDATE_RESCUE_DB_PATH = path.join(process.cwd(), 'data', testDbName);

  try {
    // 1. Populate mock pipeline data
    const dbPath = getJsonDbPath();
    const mockData = {
      transactions: [{ id: 'old_1', amount: 100 }],
      classifications: [{ transaction_id: 'old_1', cause: 'unknown' }],
      decisions: [{ transaction_id: 'old_1', action: 'stop' }],
      guardrail_checks: [{ transaction_id: 'old_1', check: 'opt_out' }],
      executions: [{ transaction_id: 'old_1', outcome: 'stopped' }],
      audit_log: [{ transaction_id: 'old_1', stage: 'test' }],
      promises: [],
      ledger: [{ transaction_id: 'old_1', amount: 100 }],
      batch_runs: [
        { id: 'batch_1', status: 'running' }
      ],
      settings: {
        dataset_generation_version: 1,
        dispatch_kill_switch: false
      }
    };

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify(mockData, null, 2));
    console.log(`[PASS] Mock data populated at ${dbPath}`);

    // 2. Run reset
    const result = await resetAndGenerateFreshDataset({
      transactionCount: 50,
      seed: 42,
      requestedBy: 'cli',
      preserveSettings: true
    });

    console.log(`[PASS] Reset completed. Dataset: ${result.datasetId}`);

    // 3. Verify Backup Exists and Contains Paused Batch
    if (!fs.existsSync(result.backupPath)) {
      throw new Error('Backup file was not created.');
    }
    const backupDb = JSON.parse(fs.readFileSync(result.backupPath, 'utf8'));
    if (backupDb.batch_runs[0].status !== 'paused') {
      throw new Error('Active batch was not paused in the backup!');
    }
    if (backupDb.settings.dispatch_kill_switch !== true) {
      throw new Error('Kill switch was not enabled in backup when pausing batch!');
    }
    console.log(`[PASS] Backup verified. Active batches were correctly paused.`);

    // 4. Verify Fresh DB State
    const freshDb = JSON.parse(fs.readFileSync(result.dbPath, 'utf8'));
    if (freshDb.transactions.length !== 50) {
      throw new Error(`Expected 50 transactions, got ${freshDb.transactions.length}`);
    }
    if (freshDb.classifications.length !== 0 || freshDb.ledger.length !== 0) {
      throw new Error('Pipeline arrays were not reset.');
    }
    if (freshDb.settings.dataset_generation_version !== 2) {
      throw new Error(`Generation version should be 2, got ${freshDb.settings.dataset_generation_version}`);
    }
    if (freshDb.settings.dispatch_kill_switch === true) {
      throw new Error('Kill switch was not cleared in the fresh DB!');
    }
    console.log(`[PASS] Fresh DB verified. Pipeline arrays are empty, version incremented.`);

    // 5. Test Rejection States
    process.env.ALLOW_SYNTHETIC_DATA_RESET = 'false';
    let rejected = false;
    try {
      await resetAndGenerateFreshDataset({ transactionCount: 10, requestedBy: 'cli' });
    } catch (e) {
      rejected = true;
    }
    if (!rejected) throw new Error('Failed to enforce ALLOW_SYNTHETIC_DATA_RESET=false');
    console.log(`[PASS] Safety flags successfully block resets.`);

    console.log('\n✅ RESET DATASET TEST: PASS');

  } catch (err) {
    console.error('\n❌ RESET DATASET TEST: FAIL');
    console.error(err);
    process.exit(1);
  } finally {
    // Cleanup test files
    if (process.env.MANDATE_RESCUE_DB_PATH && fs.existsSync(process.env.MANDATE_RESCUE_DB_PATH)) {
      fs.unlinkSync(process.env.MANDATE_RESCUE_DB_PATH);
    }
  }
}

runTests();
