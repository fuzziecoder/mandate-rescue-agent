import { ProviderWebhookReceipt, ProviderName, ProviderEventType } from '../providers/types';
import { getWebhookReceipt, saveWebhookReceipt } from '../db';

export async function claimWebhookEvent(
  providerEventId: string,
  provider: ProviderName,
  eventType: ProviderEventType,
  payloadHash: string
): Promise<
  | { claimed: true; receipt: ProviderWebhookReceipt }
  | { claimed: false; reason: "duplicate"; receipt: ProviderWebhookReceipt }
> {
  const existing = await getWebhookReceipt(providerEventId);

  if (existing) {
    return {
      claimed: false,
      reason: "duplicate",
      receipt: existing as ProviderWebhookReceipt,
    };
  }

  const receipt: ProviderWebhookReceipt = {
    provider,
    provider_event_id: providerEventId,
    provider_event_type: eventType,
    received_at: new Date().toISOString(),
    payload_hash: payloadHash,
    processing_status: "received",
  };

  await saveWebhookReceipt(receipt);

  return {
    claimed: true,
    receipt,
  };
}
