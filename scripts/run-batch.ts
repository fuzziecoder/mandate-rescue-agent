import { getTransactions, getBatchMetrics, getLedgerEntries } from '../src/lib/db';
import { processTransactionPipeline } from '../src/lib/pipeline';
import { FailedTransaction } from '../src/lib/types';

async function main() {
  console.log('Fetching transactions from local DB...');
  let txs = await getTransactions();
  if (txs.length === 0) {
    console.error('No transactions found. Please run scripts/generate-data.ts first.');
    process.exit(1);
  }

  // Ensure batch rerun safety: skip transactions already recovered in the ledger
  const ledgerEntries = await getLedgerEntries();
  const recoveredTxIds = new Set(ledgerEntries.map((e: any) => e.transaction_id));
  txs = txs.filter(tx => !recoveredTxIds.has(tx.id));

  console.log(`Starting batch execution pipeline for ${txs.length} transactions (skipped ${recoveredTxIds.size} already recovered)...`);
  
  // Process in chunks to prevent concurrent API rate issues if keys are active
  const chunkSize = 15;
  for (let i = 0; i < txs.length; i += chunkSize) {
    const chunk = txs.slice(i, i + chunkSize);
    
    await Promise.all(chunk.map(async (tx) => {
      try {
        await processTransactionPipeline(tx as unknown as FailedTransaction);
      } catch (err) {
        console.error(`Pipeline failed for transaction ${tx.id}:`, err);
      }
    }));
    
    console.log(`Executed: ${Math.min(i + chunkSize, txs.length)} / ${txs.length}`);
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
  console.log(`False-Positive Nudges : ${metrics.falsePositiveCostCount} (Transaction value: ₹${metrics.falsePositiveCostAmount.toLocaleString('en-IN')})`);
  console.log('----------------------------\n');
}

main().catch(console.error);
