import { getTransactions, getSettings, updateSettings, getBatchMetrics } from '../src/lib/db';
import { startBatchRun, runBatchAsync } from '../src/lib/batchEngine';

async function main() {
  console.log('Fetching transactions from local DB...');
  const txs = await getTransactions();
  if (txs.length === 0) {
    console.error('No transactions found. Please run scripts/generate-data.ts first.');
    process.exit(1);
  }

  const settings = await getSettings();
  if (settings.dispatch_kill_switch) {
    console.log('Dispatch kill-switch is currently active. Temporarily disabling for CLI batch execution...');
    await updateSettings({ dispatch_kill_switch: false, updated_by: 'cli_run_batch' });
  }

  console.log(`Starting batch execution pipeline for ${txs.length} transactions via Batch Engine...`);

  const result = await startBatchRun({
    source: 'synthetic_script',
    transactionIds: 'all',
    delayMs: 0, // Run at full speed for CLI
  });

  console.log(`Batch ${result.batchId} launched in state: ${result.status}. Processing...`);

  // Wait for batch to finish synchronously in CLI script
  if (result.batchId) {
    await runBatchAsync(result.batchId, txs.map(t => t.id), 0);
  }

  console.log('\nRecovery batch execution completed successfully!');
  const metrics = await getBatchMetrics();

  console.log('\n--- BATCH METRICS REPORT ---');
  console.log(`Total Volume At Risk : ₹${metrics.totalAtRisk.toLocaleString('en-IN')}`);
  console.log(`Total Volume Recovered: ₹${metrics.totalRecovered.toLocaleString('en-IN')} (${metrics.recoveryRate.toFixed(2)}%)`);
  console.log(`Recovered Mandates    : ${metrics.recoveredCount}`);
  console.log(`Failed Mandates       : ${metrics.failedCount}`);
  console.log(`Stopped Mandates      : ${metrics.stoppedCount}`);
  console.log(`Pending Mandates      : ${metrics.pendingCount}`);
  console.log('----------------------------\n');
}

main().catch(console.error);
