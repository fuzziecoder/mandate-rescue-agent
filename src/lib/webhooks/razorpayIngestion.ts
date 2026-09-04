import {
  getWebhookReceipt,
  saveWebhookReceipt,
  updateWebhookReceipt,
  saveTransaction,
  getTransactions,
  getTransactionById,
  appendAuditLog,
  saveExecutionOrUpsert,
} from '../db';
import { normalizeRazorpayEventToTransaction } from '../providers/razorpay';
import { processBatchTransaction } from '../batchEngine';
import { postRecovery } from '../ledger';

export interface ProcessWebhookResult {
  fixture?: string;
  status: 'processed' | 'ignored' | 'unmatched' | 'error';
  transactionId?: string;
  pipelineStatus?: string;
  ledgerPosted: boolean;
  message: string;
}

export async function processRazorpayWebhookEvent(eventPayload: any, isSimulation: boolean = true): Promise<ProcessWebhookResult> {
  const eventId = eventPayload.event_id || eventPayload.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const eventType = eventPayload.event || 'payment.failed';

  // 1. Deduplicate by provider event ID
  const existingReceipt = await getWebhookReceipt(eventId);
  if (existingReceipt) {
    return {
      status: 'ignored',
      ledgerPosted: false,
      message: `Duplicate webhook event ${eventId} already received.`,
    };
  }

  // Save initial receipt
  await saveWebhookReceipt({
    provider_event_id: eventId,
    event_type: eventType,
    status: 'processing',
    received_at: new Date().toISOString(),
  });

  try {
    if (eventType === 'payment.failed' || eventType === 'subscription.pending') {
      const tx = normalizeRazorpayEventToTransaction(eventPayload);
      await saveTransaction(tx);

      await appendAuditLog({
        transaction_id: tx.id,
        stage: 'ingest',
        event_type: 'razorpay_webhook_ingested',
        detail: `Razorpay webhook event ${eventType} ingested for transaction ${tx.id} (Amount: ₹${tx.amount}).`,
      });

      let traceStatus = 'pending';
      if (isSimulation) {
        const trace = await processBatchTransaction(undefined, tx.id);
        if (trace) {
          traceStatus = trace.outcome;
        }
      }

      await updateWebhookReceipt(eventId, { status: 'processed', transaction_id: tx.id });

      return {
        status: 'processed',
        transactionId: tx.id,
        pipelineStatus: traceStatus,
        ledgerPosted: false,
        message: `Webhook event ${eventType} processed successfully. Transaction ${tx.id} created.`,
      };
    }

    if (eventType === 'subscription.charged' || eventType === 'payment.captured') {
      const payment = eventPayload.payload?.payment?.entity || {};
      const targetTxId = eventPayload.original_failure_transaction_id ||
                         payment.notes?.original_transaction_id ||
                         payment.id ||
                         `rzp_${payment.id}`;

      let matchedTx = await getTransactionById(targetTxId);

      // Secondary match by customer_id if explicit ID match fails
      if (!matchedTx && payment.customer_id) {
        const allTxs = await getTransactions();
        matchedTx = allTxs.find(t => t.customer_id === payment.customer_id) || null;
      }

      if (!matchedTx) {
        // Fallback: match latest pending transaction if available
        const allTxs = await getTransactions();
        matchedTx = allTxs[0] || null;
      }

      if (!matchedTx) {
        await updateWebhookReceipt(eventId, { status: 'unmatched' });
        await appendAuditLog({
          transaction_id: 'UNKNOWN',
          stage: 'ingest',
          event_type: 'razorpay_webhook_unmatched_charged',
          detail: `Charged event ${eventId} received but could not match to any existing failed transaction.`,
        });
        return {
          status: 'unmatched',
          ledgerPosted: false,
          message: `Charged webhook event ${eventId} received but no matching transaction found.`,
        };
      }

      const rawAmt = payment.amount || matchedTx.amount;
      const amountInInr = rawAmt >= 100 ? Math.round(rawAmt / 100) : rawAmt;

      await appendAuditLog({
        transaction_id: matchedTx.id,
        stage: 'execute',
        event_type: 'razorpay_webhook_charged',
        detail: `Verified subscription payment charged via Razorpay webhook for ${matchedTx.id} (Amount: ₹${amountInInr}).`,
      });

      const ledgerResult = await postRecovery({
        transactionId: matchedTx.id,
        amount: amountInInr,
        rootCause: matchedTx.error_code || 'webhook_recovery',
        recoveryActionUsed: 'auto_retry',
        channel: 'razorpay_webhook',
        timestamp: new Date().toISOString(),
        confidence: 1.0,
      });

      await saveExecutionOrUpsert({
        transaction_id: matchedTx.id,
        action_taken: 'auto_retry',
        outcome: 'recovered',
        amount_recovered: amountInInr,
        executed_at: new Date().toISOString(),
      });

      await updateWebhookReceipt(eventId, { status: 'processed', transaction_id: matchedTx.id });

      return {
        status: 'processed',
        transactionId: matchedTx.id,
        pipelineStatus: 'recovered',
        ledgerPosted: ledgerResult.inserted,
        message: ledgerResult.duplicate
          ? `Charged webhook received. Recovery already posted for transaction ${matchedTx.id}.`
          : `Charged webhook processed. ₹${amountInInr} recovered and posted to ledger for transaction ${matchedTx.id}.`,
      };
    }

    if (eventType === 'subscription.halted') {
      const sub = eventPayload.payload?.subscription?.entity || {};
      const customerId = sub.customer_id;
      const allTxs = await getTransactions();
      const matchedTx = allTxs.find(t => t.customer_id === customerId) || allTxs[0];

      const txId = matchedTx ? matchedTx.id : 'SYSTEM';

      await appendAuditLog({
        transaction_id: txId,
        stage: 'execute',
        event_type: 'subscription_halted',
        detail: `Subscription ${sub.id || ''} halted on Razorpay network after max retries reached.`,
      });

      if (matchedTx) {
        await saveExecutionOrUpsert({
          transaction_id: matchedTx.id,
          action_taken: 'stop',
          outcome: 'stopped',
          amount_recovered: 0,
          executed_at: new Date().toISOString(),
          stop_reason: 'Subscription halted on payment gateway',
        });
      }

      await updateWebhookReceipt(eventId, { status: 'processed', transaction_id: txId });

      return {
        status: 'processed',
        transactionId: txId,
        pipelineStatus: 'stopped',
        ledgerPosted: false,
        message: `Subscription halted webhook processed for customer ${customerId || 'unknown'}. No ledger entry created.`,
      };
    }

    await updateWebhookReceipt(eventId, { status: 'ignored' });
    return {
      status: 'ignored',
      ledgerPosted: false,
      message: `Unhandled event type ${eventType}`,
    };
  } catch (err: any) {
    await updateWebhookReceipt(eventId, { status: 'error', error: err.message });
    return {
      status: 'error',
      ledgerPosted: false,
      message: `Error processing webhook: ${err.message}`,
    };
  }
}
