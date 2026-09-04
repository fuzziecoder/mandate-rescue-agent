import {
  getTransactions,
  getTransactionById,
  getSettings,
  updateSettings,
  createBatchRun,
  getBatchRunById,
  getLatestBatchRun,
  updateBatchRun,
  getExecutions,
  getLedgerEntries,
  appendAuditLog,
  BatchRunRecord,
  Transaction,
} from './db';
import { isEligibleForBatch } from './batchEligibility';
import { processTransactionPipeline, PipelineTrace } from './pipeline';
import { FailedTransaction } from './types';
import {
  calculateTotalAtRisk,
  calculateRecoveredRevenue,
  calculateOutcomeCounts,
} from './metrics';
import { postRecoveryOnce } from './ledger';

// Keep track of active background promises to prevent orphaned loops per process
const activeBatchPromises = new Map<string, Promise<void>>();

export interface StartBatchOptions {
  source?: 'synthetic_script' | 'dashboard' | 'razorpay_fixture' | string;
  transactionIds?: string[] | 'all';
  delayMs?: number;
}

export interface StartBatchResult {
  batchId: string | null;
  status: string;
  message?: string;
  total?: number;
  totalSelected?: number;
  eligibleCount?: number;
  skippedRecovered?: number;
  skippedStopped?: number;
  skippedFailed?: number;
  totalAtRisk?: number;
}

/**
 * Start a batch run given transaction selection options with eligibility evaluation
 */
export async function startBatchRun(options: StartBatchOptions = {}): Promise<StartBatchResult> {
  const allTxs = await getTransactions();
  if (!allTxs || allTxs.length === 0) {
    throw new Error('No transactions available. Run the generator first.');
  }

  let selectedTxs: Transaction[] = [];
  if (!options.transactionIds || options.transactionIds === 'all') {
    selectedTxs = allTxs;
  } else if (Array.isArray(options.transactionIds)) {
    const idSet = new Set(options.transactionIds);
    selectedTxs = allTxs.filter(tx => idSet.has(tx.id));
  }

  if (selectedTxs.length === 0) {
    throw new Error('No transactions match the selected criteria.');
  }

  // 1. Evaluate eligibility for every selected transaction
  const eligibleIds: string[] = [];
  let skippedRecovered = 0;
  let skippedStopped = 0;
  let skippedFailed = 0;
  let skippedOther = 0;

  for (const tx of selectedTxs) {
    const check = await isEligibleForBatch(tx.id);
    if (check.eligible) {
      eligibleIds.push(tx.id);
    } else {
      if (check.reason.includes('Already posted') || check.reason.includes('Recovered')) {
        skippedRecovered++;
      } else if (check.reason.includes('stopped')) {
        skippedStopped++;
      } else if (check.reason.includes('failed')) {
        skippedFailed++;
      } else {
        skippedOther++;
      }
    }
  }

  // If no records are eligible, return nothing_to_process response safely
  if (eligibleIds.length === 0) {
    await appendAuditLog({
      transaction_id: 'SYSTEM',
      stage: 'guardrails',
      event_type: 'batch_rerun_nothing_to_process',
      detail: `Batch execution request evaluated: 0 of ${selectedTxs.length} eligible. ${skippedRecovered} recovered, ${skippedStopped} stopped, ${skippedFailed} failed cases safely skipped.`,
    });

    return {
      batchId: null,
      status: 'nothing_to_process',
      message: 'No eligible recovery cases. Recovered and stopped transactions were safely skipped.',
      eligibleCount: 0,
      totalSelected: selectedTxs.length,
      skippedRecovered,
      skippedStopped,
      skippedFailed,
      totalAtRisk: 0,
    };
  }

  const eligibleTxs = selectedTxs.filter(tx => eligibleIds.includes(tx.id));
  const totalAtRiskEligible = calculateTotalAtRisk(eligibleTxs);
  const settings = await getSettings();

  const batchRun = await createBatchRun({
    source: options.source || 'dashboard',
    status: settings.dispatch_kill_switch ? 'paused' : 'queued',
    total: eligibleIds.length,
    total_selected: selectedTxs.length,
    total_eligible: eligibleIds.length,
    skipped_recovered: skippedRecovered,
    skipped_stopped: skippedStopped,
    skipped_failed: skippedFailed,
    skipped_other: skippedOther,
    processed: 0,
    recovered_count: 0,
    stopped_count: 0,
    pending_count: eligibleIds.length,
    failed_count: 0,
    total_at_risk: totalAtRiskEligible,
    total_recovered: 0,
    started_at: new Date().toISOString(),
  });

  const delayMs = typeof options.delayMs === 'number'
    ? Math.min(1000, Math.max(0, options.delayMs))
    : Number(process.env.BATCH_DEMO_DELAY_MS) || 120;

  if (settings.dispatch_kill_switch) {
    await appendAuditLog({
      transaction_id: 'SYSTEM',
      stage: 'guardrails',
      event_type: 'dispatch_kill_switch_active',
      detail: `Batch ${batchRun.id} created in PAUSED state because dispatch kill-switch is active.`,
    });
  } else {
    // Launch background batch loop non-blocking
    runBatchAsync(batchRun.id, eligibleIds, delayMs).catch(err => {
      console.error(`[BatchEngine] Execution error for batch ${batchRun.id}:`, err);
    });
  }

  return {
    batchId: batchRun.id,
    status: batchRun.status,
    total: batchRun.total,
    eligibleCount: eligibleIds.length,
    totalSelected: selectedTxs.length,
    skippedRecovered,
    skippedStopped,
    skippedFailed,
    totalAtRisk: batchRun.total_at_risk,
  };
}

/**
 * Execute batch loop transaction-by-transaction in background
 */
export async function runBatchAsync(batchId: string, transactionIds: string[], delayMs: number = 120): Promise<void> {
  if (activeBatchPromises.has(batchId)) {
    return activeBatchPromises.get(batchId)!;
  }

  const promise = (async () => {
    try {
      await updateBatchRun(batchId, { status: 'running' });
      const batch = await getBatchRunById(batchId);
      if (!batch) return;

      const startIndex = batch.processed || 0;

      for (let i = startIndex; i < transactionIds.length; i++) {
        // 1. Read settings before each transaction step
        const settings = await getSettings();
        if (settings.dispatch_kill_switch) {
          console.log(`[BatchEngine] Dispatch kill-switch detected ON. Pausing batch ${batchId} at index ${i}.`);
          await appendAuditLog({
            transaction_id: transactionIds[i] || 'SYSTEM',
            stage: 'guardrails',
            event_type: 'dispatch_kill_switch_active',
            detail: `Batch execution paused at ${i}/${transactionIds.length} due to active dispatch kill-switch.`,
          });
          await updateBatchRun(batchId, {
            status: 'paused',
            processed: i,
          });
          activeBatchPromises.delete(batchId);
          return;
        }

        // Check if batch status was externally set to paused or failed
        const freshBatch = await getBatchRunById(batchId);
        if (freshBatch && (freshBatch.status === 'paused' || freshBatch.status === 'failed')) {
          console.log(`[BatchEngine] Batch ${batchId} status is ${freshBatch.status}. Stopping loop.`);
          activeBatchPromises.delete(batchId);
          return;
        }

        const txId = transactionIds[i];

        // Re-check eligibility before processing each individual transaction
        const eligibility = await isEligibleForBatch(txId);
        if (!eligibility.eligible) {
          await appendAuditLog({
            transaction_id: txId,
            stage: 'execute',
            event_type: 'batch_skip_ineligible',
            detail: `Skipped transaction ${txId}: ${eligibility.reason}`,
          });
        } else {
          const tx = await getTransactionById(txId);
          if (tx) {
            try {
              await processTransactionPipeline(tx as unknown as FailedTransaction);
            } catch (err: any) {
              console.error(`[BatchEngine] Error processing transaction ${txId}:`, err);
            }
          }
        }

        // Recompute metrics from DB records after each transaction step
        const executions = await getExecutions();
        const ledgerEntries = await getLedgerEntries();
        const allTransactions = await getTransactions();

        const outcomeCounts = calculateOutcomeCounts(executions, allTransactions);
        const totalRecovered = calculateRecoveredRevenue(ledgerEntries);

        await updateBatchRun(batchId, {
          processed: i + 1,
          recovered_count: outcomeCounts.recoveredCount,
          stopped_count: outcomeCounts.stoppedCount,
          pending_count: outcomeCounts.pendingCount,
          failed_count: outcomeCounts.failedCount,
          total_recovered: totalRecovered,
        });

        if (delayMs > 0) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }

      // Batch completed successfully
      const finalExecutions = await getExecutions();
      const finalLedger = await getLedgerEntries();
      const finalTransactions = await getTransactions();
      const finalOutcomeCounts = calculateOutcomeCounts(finalExecutions, finalTransactions);
      const finalTotalRecovered = calculateRecoveredRevenue(finalLedger);

      await updateBatchRun(batchId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        processed: transactionIds.length,
        recovered_count: finalOutcomeCounts.recoveredCount,
        stopped_count: finalOutcomeCounts.stoppedCount,
        pending_count: finalOutcomeCounts.pendingCount,
        failed_count: finalOutcomeCounts.failedCount,
        total_recovered: finalTotalRecovered,
      });

      console.log(`[BatchEngine] Batch ${batchId} completed successfully.`);
    } catch (err: any) {
      console.error(`[BatchEngine] Fatal batch error for ${batchId}:`, err);
      await updateBatchRun(batchId, {
        status: 'failed',
        error_message: err.message || 'Unexpected batch execution error',
      });
      await appendAuditLog({
        transaction_id: 'SYSTEM',
        stage: 'execute',
        event_type: 'batch_failed',
        detail: `Batch ${batchId} failed: ${err.message}`,
      });
    } finally {
      activeBatchPromises.delete(batchId);
    }
  })();

  activeBatchPromises.set(batchId, promise);
  return promise;
}

/**
 * Process a single transaction using the pipeline (for webhook / isolated trigger)
 */
export async function processBatchTransaction(batchId: string | undefined, transactionId: string): Promise<PipelineTrace | null> {
  const settings = await getSettings();
  if (settings.dispatch_kill_switch) {
    await appendAuditLog({
      transaction_id: transactionId,
      stage: 'guardrails',
      event_type: 'dispatch_kill_switch_active',
      detail: `Single transaction execution blocked due to active kill-switch.`,
    });
    return null;
  }

  // Re-check eligibility before isolated trigger
  const eligibility = await isEligibleForBatch(transactionId);
  if (!eligibility.eligible) {
    await appendAuditLog({
      transaction_id: transactionId,
      stage: 'execute',
      event_type: 'single_tx_skip_ineligible',
      detail: `Single transaction execution skipped for ${transactionId}: ${eligibility.reason}`,
    });
    return null;
  }

  const tx = await getTransactionById(transactionId);
  if (!tx) return null;

  const trace = await processTransactionPipeline(tx as unknown as FailedTransaction);

  if (batchId) {
    const executions = await getExecutions();
    const ledgerEntries = await getLedgerEntries();
    const allTransactions = await getTransactions();
    const outcomeCounts = calculateOutcomeCounts(executions, allTransactions);
    const totalRecovered = calculateRecoveredRevenue(ledgerEntries);

    const batch = await getBatchRunById(batchId);
    if (batch) {
      await updateBatchRun(batchId, {
        processed: (batch.processed || 0) + 1,
        recovered_count: outcomeCounts.recoveredCount,
        stopped_count: outcomeCounts.stoppedCount,
        pending_count: outcomeCounts.pendingCount,
        failed_count: outcomeCounts.failedCount,
        total_recovered: totalRecovered,
      });
    }
  }

  return trace;
}

export async function getBatchRunStatus(batchId?: string): Promise<BatchRunRecord | null> {
  if (batchId) {
    return getBatchRunById(batchId);
  }
  return getLatestBatchRun();
}

export async function requestPauseBatch(batchId: string) {
  await updateSettings({
    dispatch_kill_switch: true,
    updated_at: new Date().toISOString(),
    updated_by: 'dashboard',
  });

  await appendAuditLog({
    transaction_id: 'SYSTEM',
    stage: 'guardrails',
    event_type: 'dispatch_kill_switch_enabled',
    detail: `Global dispatch kill-switch activated. Pausing batch ${batchId}.`,
  });

  const updatedBatch = await updateBatchRun(batchId, { status: 'paused' });
  activeBatchPromises.delete(batchId);
  return updatedBatch;
}

export async function resumeBatch(batchId: string) {
  await updateSettings({
    dispatch_kill_switch: false,
    updated_at: new Date().toISOString(),
    updated_by: 'dashboard',
  });

  await appendAuditLog({
    transaction_id: 'SYSTEM',
    stage: 'guardrails',
    event_type: 'dispatch_kill_switch_disabled',
    detail: `Global dispatch kill-switch deactivated. Resuming batch ${batchId}.`,
  });

  const batch = await getBatchRunById(batchId);
  if (!batch) {
    throw new Error(`Batch ${batchId} not found`);
  }

  const allTxs = await getTransactions();
  const eligibleIds: string[] = [];
  for (const t of allTxs) {
    const check = await isEligibleForBatch(t.id);
    if (check.eligible) eligibleIds.push(t.id);
  }

  const delayMs = Number(process.env.BATCH_DEMO_DELAY_MS) || 120;
  runBatchAsync(batchId, eligibleIds, delayMs).catch(err => {
    console.error(`[BatchEngine] Resume error for batch ${batchId}:`, err);
  });

  return getBatchRunById(batchId);
}
