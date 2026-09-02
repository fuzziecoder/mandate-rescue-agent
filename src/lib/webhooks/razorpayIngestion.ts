import crypto from 'crypto';
import { normalizeRazorpayWebhook } from '../providers/razorpay';
import { ProviderEventType } from '../providers/types';
import { claimWebhookEvent } from './idempotency';
import {
  getTransactions,
  saveTransactions,
  saveAuditLog,
  getExecutions,
  saveExecution,
  getClassifications,
  updateWebhookReceipt,
} from '../db';
import { processTransactionPipeline } from '../pipeline';
import { postRecovery } from '../ledger';
import { FailedTransaction } from '../types';

export async function ingestRazorpayWebhookEvent(args: {
  eventType: string;
  rawBody: string;
  payload: unknown;
  mode: 'simulation' | 'production';
}): Promise<{
  status: 'processed' | 'duplicate' | 'ignored' | 'failed';
  providerEventId?: string;
  normalizedTransactionId?: string | null;
  pipelineStatus?: string | null;
  ledgerPosted?: boolean;
  message: string;
}> {
  const { eventType, rawBody, payload, mode } = args;

  // A. Normalize Input
  const normalizedEvent = normalizeRazorpayWebhook(eventType, payload);

  if (!normalizedEvent) {
    const rawHash = crypto.createHash('sha256').update(rawBody || '').digest('hex');
    const fallbackEventId = `unk_${rawHash.slice(0, 16)}`;
    await updateWebhookReceipt(fallbackEventId, {
      processing_status: 'ignored',
      error_message: 'Unsupported or unhandled Razorpay event type.',
    });
    return {
      status: 'ignored',
      message: 'Unsupported or unhandled Razorpay event type.',
    };
  }

  const { provider_event_id, provider_event_type } = normalizedEvent;
  const payloadHash = crypto.createHash('sha256').update(rawBody || '').digest('hex');

  // B. Claim Idempotency
  const claim = await claimWebhookEvent(
    provider_event_id,
    'razorpay',
    provider_event_type as ProviderEventType,
    payloadHash
  );

  if (!claim.claimed) {
    return {
      status: 'duplicate',
      providerEventId: provider_event_id,
      normalizedTransactionId: claim.receipt.normalized_transaction_id,
      ledgerPosted: false,
      message: 'Duplicate webhook event received. Skipped processing.',
    };
  }

  try {
    // Handle Failure Events (payment.failed, subscription.pending)
    if (normalizedEvent.kind === 'failure' && provider_event_type !== 'subscription.halted') {
      const { transaction } = normalizedEvent;

      const existingTxs = await getTransactions();
      let targetTx = existingTxs.find((t) => t.id === transaction.id);

      if (!targetTx) {
        // Map normalized transaction to internal DB shape
        const newDbTx = {
          id: transaction.id,
          customer_id: transaction.customer_id,
          amount: transaction.amount,
          currency: transaction.currency,
          mandate_id: transaction.mandate_id || `mand_${transaction.id}`,
          bank_name: transaction.bank_name || 'Razorpay Partner Bank',
          error_code: transaction.error_code,
          error_message: transaction.error_message,
          failed_at: transaction.failed_at,
          subscription_type: transaction.subscription_type || 'UPI Autopay Subscription',
          customer_payment_history: {
            past_success_rate: transaction.customer_payment_history.past_success_rate,
            avg_balance_pattern: transaction.customer_payment_history.avg_balance_pattern as any,
            payment_timing: transaction.customer_payment_history.payment_timing as any,
            opt_out: transaction.customer_payment_history.opt_out,
            recent_nudges_count: transaction.customer_payment_history.recent_nudges_count,
            past_retry_attempts: transaction.customer_payment_history.past_retry_attempts,
          },
        };

        await saveTransactions([newDbTx as any]);
        targetTx = newDbTx as any;
      }

      await saveAuditLog({
        transaction_id: transaction.id,
        stage: 'provider_webhook_received',
        event_type: 'razorpay_failure_event_received',
        detail: `Razorpay webhook ${provider_event_type} received in ${mode} mode for event ${provider_event_id}`,
        timestamp: new Date().toISOString(),
      });

      let pipelineStatus = 'queued';

      if (mode === 'simulation') {
        const pipelineInput: FailedTransaction = {
          id: targetTx!.id,
          customerId: targetTx!.customer_id,
          amount: targetTx!.amount,
          currency: targetTx!.currency,
          mandateId: targetTx!.mandate_id,
          bankName: targetTx!.bank_name,
          errorCode: targetTx!.error_code,
          errorMessage: targetTx!.error_message,
          failedAt: targetTx!.failed_at,
          customerPaymentHistory: {
            pastSuccessRate: targetTx!.customer_payment_history.past_success_rate,
            avgBalancePattern: targetTx!.customer_payment_history.avg_balance_pattern as any,
            paymentTiming: targetTx!.customer_payment_history.payment_timing as any,
            optOut: targetTx!.customer_payment_history.opt_out,
            recentNudgesCount: targetTx!.customer_payment_history.recent_nudges_count,
            pastRetryAttempts: targetTx!.customer_payment_history.past_retry_attempts,
          },
          subscriptionType: targetTx!.subscription_type,
        };

        await processTransactionPipeline(pipelineInput);
        pipelineStatus = 'completed';
      } else {
        await saveAuditLog({
          transaction_id: transaction.id,
          stage: 'provider_failure_queued',
          event_type: 'provider_failure_queued_for_recovery',
          detail: `Transaction ${transaction.id} queued for recovery worker in production mode.`,
          timestamp: new Date().toISOString(),
        });
      }

      await updateWebhookReceipt(provider_event_id, {
        processing_status: 'processed',
        normalized_transaction_id: transaction.id,
      });

      return {
        status: 'processed',
        providerEventId: provider_event_id,
        normalizedTransactionId: transaction.id,
        pipelineStatus,
        ledgerPosted: false,
        message: `Ingested ${provider_event_type} webhook and initialized failure transaction.`,
      };
    }

    // Handle Subscription Halted
    if (normalizedEvent.kind === 'failure' && provider_event_type === 'subscription.halted') {
      const { transaction } = normalizedEvent;
      const existingTxs = await getTransactions();

      const matchedTx = existingTxs.find(
        (t) =>
          t.id === transaction.id ||
          (transaction.mandate_id && t.mandate_id === transaction.mandate_id) ||
          (transaction.provider_subscription_id && t.id.includes(transaction.provider_subscription_id))
      );

      const matchedTxId = matchedTx ? matchedTx.id : transaction.id;

      await saveAuditLog({
        transaction_id: matchedTxId,
        stage: 'provider_subscription_halted',
        event_type: 'razorpay_subscription_halted',
        detail: `Subscription halted event ${provider_event_id} received. Recovery stopped without money movement.`,
        timestamp: new Date().toISOString(),
      });

      if (matchedTx) {
        await saveExecution({
          transaction_id: matchedTxId,
          outcome: 'stopped',
          recovered_amount: 0,
          timestamp: new Date().toISOString(),
        });
      }

      await updateWebhookReceipt(provider_event_id, {
        processing_status: 'processed',
        normalized_transaction_id: matchedTxId,
      });

      return {
        status: 'processed',
        providerEventId: provider_event_id,
        normalizedTransactionId: matchedTxId,
        pipelineStatus: 'stopped',
        ledgerPosted: false,
        message: 'Subscription halted event recorded. No ledger entry created.',
      };
    }

    // Handle Success Events (payment.captured, subscription.charged)
    if (normalizedEvent.kind === 'success') {
      const existingTxs = await getTransactions();

      let matchedTx = null;

      // 1. Explicit ID
      if (normalizedEvent.original_failure_transaction_id) {
        matchedTx = existingTxs.find((t) => t.id === normalizedEvent.original_failure_transaction_id);
      }

      // 2. Mandate ID match
      if (!matchedTx && normalizedEvent.mandate_id) {
        matchedTx = existingTxs.find((t) => t.mandate_id === normalizedEvent.mandate_id);
      }

      // 3. Subscription ID match
      if (!matchedTx && normalizedEvent.provider_subscription_id) {
        matchedTx = existingTxs.find((t) => t.id.includes(normalizedEvent.provider_subscription_id!));
      }

      // 4. Payment ID correlation
      if (!matchedTx && normalizedEvent.provider_payment_id) {
        matchedTx = existingTxs.find((t) => t.id.includes(normalizedEvent.provider_payment_id!));
      }

      if (!matchedTx) {
        await saveAuditLog({
          transaction_id: `unmatched_${provider_event_id}`,
          stage: 'provider_unmatched_success',
          event_type: 'unmatched_provider_success_event',
          detail: `Success event ${provider_event_id} received but no matching failed transaction found.`,
          timestamp: new Date().toISOString(),
        });

        await updateWebhookReceipt(provider_event_id, {
          processing_status: 'processed',
          normalized_transaction_id: null,
        });

        return {
          status: 'processed',
          providerEventId: provider_event_id,
          normalizedTransactionId: null,
          ledgerPosted: false,
          message: 'Success event received but no matching failed transaction found.',
        };
      }

      // Record verified recovery audit entry
      await saveAuditLog({
        transaction_id: matchedTx.id,
        stage: 'provider_verified_recovery',
        event_type: 'razorpay_success_verified',
        detail: `Verified success webhook ${provider_event_id} for amount ₹${normalizedEvent.amount}`,
        timestamp: new Date().toISOString(),
      });

      // Update execution outcome to Recovered
      await saveExecution({
        transaction_id: matchedTx.id,
        outcome: 'recovered',
        recovered_amount: normalizedEvent.amount,
        timestamp: new Date().toISOString(),
      });

      // Get classification for root cause
      const classifications = await getClassifications();
      const txClassification = classifications.find((c) => c.transaction_id === matchedTx.id);
      const rootCause = txClassification ? txClassification.predicted_cause : 'low_balance';

      // Post idempotent recovery ledger entry
      const ledgerResult = await postRecovery({
        transactionId: matchedTx.id,
        amount: normalizedEvent.amount,
        rootCause,
        recoveryActionUsed: 'retry',
        channel: 'razorpay_webhook',
        timestamp: new Date().toISOString(),
        confidence: 1.0,
      });

      await updateWebhookReceipt(provider_event_id, {
        processing_status: 'processed',
        normalized_transaction_id: matchedTx.id,
      });

      return {
        status: 'processed',
        providerEventId: provider_event_id,
        normalizedTransactionId: matchedTx.id,
        ledgerPosted: ledgerResult.inserted,
        message: ledgerResult.inserted
          ? 'Success verified and recovery posted to ledger.'
          : 'Success verified. Recovery entry already existed in ledger (idempotent duplicate skipped).',
      };
    }

    return {
      status: 'failed',
      providerEventId: provider_event_id,
      message: 'Unhandled event branch.',
    };
  } catch (error: any) {
    await updateWebhookReceipt(provider_event_id, {
      processing_status: 'failed',
      error_message: error?.message || 'Internal processing error',
    });

    return {
      status: 'failed',
      providerEventId: provider_event_id,
      message: error?.message || 'Internal ingestion failure.',
    };
  }
}
