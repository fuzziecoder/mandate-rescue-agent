import fs from 'fs';
import path from 'path';

// Force isolated test database
const testDbPath = path.join(process.cwd(), 'data', 'test-live-progress-db.json');
process.env.MANDATE_RESCUE_DB_PATH = testDbPath;
process.env.BATCH_DEMO_DELAY_MS = '100';
process.env.PIPELINE_STAGE_DELAY_MS = '30';

import {
  writeDatabase,
  getLatestBatchRun,
  Transaction,
} from '../src/lib/db';
import { startBatchRun, runBatchAsync } from '../src/lib/batchEngine';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('--- TESTING LIVE BATCH PROGRESS PERSISTENCE ---');
  console.log(`Using test database: ${testDbPath}`);

  // 1. Seed 3 synthetic transactions
  const seedTransactions: Transaction[] = [
    {
      id: 'tx_live_101',
      customer_id: 'cust_live_1',
      amount: 5000,
      currency: 'INR',
      mandate_id: 'mand_live_1',
      bank_name: 'HDFC',
      error_code: 'BANK_OFFLINE',
      error_message: 'Bank server down',
      failed_at: new Date().toISOString(),
      customer_payment_history: { past_success_rate: 0.9, avg_balance_pattern: 'normal' },
      subscription_type: 'Pro Plan',
    },
    {
      id: 'tx_live_102',
      customer_id: 'cust_live_2',
      amount: 12000,
      currency: 'INR',
      mandate_id: 'mand_live_2',
      bank_name: 'ICICI',
      error_code: 'INSUFFICIENT_FUNDS',
      error_message: 'Low balance',
      failed_at: new Date().toISOString(),
      customer_payment_history: { past_success_rate: 0.85, avg_balance_pattern: 'low', opt_out: false },
      subscription_type: 'Enterprise Plan',
    },
    {
      id: 'tx_live_103',
      customer_id: 'cust_live_3',
      amount: 3000,
      currency: 'INR',
      mandate_id: 'mand_live_3',
      bank_name: 'SBI',
      error_code: 'MANDATE_EXPIRED',
      error_message: 'Mandate expired',
      failed_at: new Date().toISOString(),
      customer_payment_history: { past_success_rate: 0.4, avg_balance_pattern: 'erratic' },
      subscription_type: 'Basic Plan',
    },
  ];

  const initialDb = {
    transactions: seedTransactions,
    classifications: [],
    decisions: [],
    guardrail_checks: [],
    executions: [],
    audit_log: [],
    promises: [],
    ledger: [],
    settings: { dispatch_kill_switch: false, updated_at: null, updated_by: 'test', dataset_generation_version: 1 },
    webhook_receipts: [],
    batch_runs: [],
  };

  writeDatabase(initialDb);
  console.log('Seeded 3 test transactions.');

  // 2. Start batch
  const batchRes = await startBatchRun({ source: 'test_script', transactionIds: 'all', delayMs: 100 });
  if (!batchRes.batchId) {
    console.error('FAIL: Could not start batch run.');
    process.exit(1);
  }
  const batchId = batchRes.batchId;
  console.log(`Created batch run: ${batchId}`);

  // 3. Launch async batch execution without await
  const batchPromise = runBatchAsync(batchId, seedTransactions.map((t) => t.id), 100);

  // 4. Poll database state every 40ms to capture intermediate progress snapshots
  const snapshots: Array<{
    processed: number;
    current_stage?: string;
    last_tx?: string | null;
    eventsCount: number;
    latestEvent?: string;
  }> = [];

  const startTime = Date.now();
  while (Date.now() - startTime < 10000) {
    const record = await getLatestBatchRun();
    if (record) {
      snapshots.push({
        processed: record.processed,
        current_stage: record.current_stage,
        last_tx: record.last_processed_transaction_id,
        eventsCount: record.recent_events?.length || 0,
        latestEvent: record.recent_events?.[0],
      });
      if (record.status === 'completed') {
        break;
      }
    }
    await sleep(40);
  }

  // Await batch completion
  await batchPromise;

  console.log(`Captured ${snapshots.length} polling snapshots during batch execution.`);

  // 5. Analyze intermediate snapshots
  const stagesSeen = new Set(snapshots.map((s) => s.current_stage).filter(Boolean));
  console.log('Stages observed during execution:', Array.from(stagesSeen));

  const processedCountsSeen = new Set(snapshots.map((s) => s.processed));
  console.log('Processed counts observed during execution:', Array.from(processedCountsSeen));

  const eventsSeen = snapshots.filter((s) => s.eventsCount > 0);
  console.log(`Snapshots with recent_events populated: ${eventsSeen.length}`);

  // Assertions
  let passed = true;

  if (snapshots.length < 3) {
    console.error('FAIL: Not enough intermediate snapshots captured!');
    passed = false;
  }

  if (!stagesSeen.has('classify') && !stagesSeen.has('decide') && !stagesSeen.has('guardrails')) {
    console.error('FAIL: Stage transitions were not observed during execution!');
    passed = false;
  }

  if (eventsSeen.length === 0) {
    console.error('FAIL: recent_events was never populated in intermediate snapshots!');
    passed = false;
  }

  const finalRecord = await getLatestBatchRun();
  console.log('Final record:', {
    status: finalRecord?.status,
    processed: finalRecord?.processed,
    total: finalRecord?.total,
    recovered_count: finalRecord?.recovered_count,
    recovery_rate: finalRecord?.recovery_rate,
    recent_events_count: finalRecord?.recent_events?.length,
  });

  if (finalRecord?.status !== 'completed' || finalRecord?.processed !== 3) {
    console.error('FAIL: Final batch run state is invalid!');
    passed = false;
  }

  // Cleanup test database
  try {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  } catch {}

  if (passed) {
    console.log('\nLIVE PROGRESS TEST: PASS');
  } else {
    console.error('\nLIVE PROGRESS TEST: FAIL');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error during test:', err);
  process.exit(1);
});
