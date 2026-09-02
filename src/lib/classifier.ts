import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { classifyWithConfiguredLlm } from './llm';
import { ClassificationResult, ClassificationMethod, FailureCause } from './llm/types';

interface CacheEntry {
  cause: FailureCause;
  confidence: number;
  reasoning: string;
  provider: 'nvidia';
  model: string;
  cached_at: string;
}

let batchLlmCallCount = 0;

export function resetBatchLlmCounter() {
  batchLlmCallCount = 0;
}

function getCacheFilePath(): string {
  return path.join(process.cwd(), 'data', 'classification-cache.json');
}

function loadCache(): Record<string, CacheEntry> {
  try {
    const file = getCacheFilePath();
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    // Ignore cache load errors
  }
  return {};
}

function saveCache(key: string, entry: CacheEntry) {
  try {
    const file = getCacheFilePath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const cache = loadCache();
    cache[key] = entry;
    fs.writeFileSync(file, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    // Ignore cache save errors
  }
}

function computeCacheKey(code: string, message: string): string {
  const normCode = (code || '').trim().toLowerCase();
  const normMsg = (message || '').trim().toLowerCase();
  return crypto.createHash('sha256').update(`${normCode}|${normMsg}`).digest('hex');
}

export function classifyRuleBased(code: string, msg: string): { cause: FailureCause; confidence: number; reasoning: string } | null {
  const c = (code || '').toUpperCase();
  const m = (msg || '').toLowerCase();

  // 1. Low Balance
  if (
    c.includes('INSUFFICIENT_FUNDS') ||
    c.includes('BAL_LOW') ||
    c.includes('LBL') ||
    c.includes('PYMT_BAL_LOW') ||
    m.includes('insufficient') ||
    m.includes('low balance') ||
    m.includes('no funds')
  ) {
    return {
      cause: 'low_balance',
      confidence: 0.95,
      reasoning: 'Matched known payment-provider error code/rule for low balance.'
    };
  }

  // 2. Bank Offline
  if (
    c.includes('OFFLINE') ||
    c.includes('TIMEOUT') ||
    c.includes('DOWNTIME') ||
    c.includes('PSP_ERR') ||
    c.includes('BANK_TIMEOUT') ||
    c.includes('BK_SYSTEM_OFFLINE') ||
    m.includes('unavailable') ||
    m.includes('timed out') ||
    m.includes('bank offline') ||
    m.includes('downtime')
  ) {
    return {
      cause: 'bank_offline',
      confidence: 0.95,
      reasoning: 'Matched known payment-provider error code/rule for bank downtime.'
    };
  }

  // 3. Expired Mandate
  if (
    c.includes('EXPIRED') ||
    c.includes('VALIDITY_EXCEEDED') ||
    c.includes('MANDATE_EXPIRED') ||
    c.includes('VALIDITY_OVER') ||
    c.includes('REVOKED') ||
    c.includes('CANCELLED') ||
    m.includes('expired') ||
    m.includes('lapsed') ||
    m.includes('revoked') ||
    m.includes('cancelled')
  ) {
    return {
      cause: 'expired_mandate',
      confidence: 0.95,
      reasoning: 'Matched known payment-provider error code/rule for mandate expiration/revocation.'
    };
  }

  // 4. Limit Exceeded
  if (
    c.includes('LIMIT_EXCEEDED') ||
    c.includes('AMT_LIMIT') ||
    c.includes('DAILY_LIMIT') ||
    m.includes('limit exceeded') ||
    m.includes('exceeds limit')
  ) {
    return {
      cause: 'limit_exceeded',
      confidence: 0.95,
      reasoning: 'Matched known payment-provider error code/rule for limit exceeded.'
    };
  }

  // 5. Wrong Debit Date
  if (
    c.includes('WRONG_DEBIT_DATE') ||
    c.includes('DEBIT_DATE_INVALID') ||
    m.includes('debit date') ||
    m.includes('outside cycle')
  ) {
    return {
      cause: 'wrong_debit_date',
      confidence: 0.95,
      reasoning: 'Matched known payment-provider error code/rule for wrong debit date.'
    };
  }

  return null;
}

export async function classifyTransaction(input: {
  error_code: string;
  error_message: string;
  bank_name?: string;
  amount?: number;
  failed_at?: string;
  mandate_status?: string;
}): Promise<ClassificationResult> {
  // A & B: Run rule-based regex first
  const ruleMatch = classifyRuleBased(input.error_code, input.error_message);
  if (ruleMatch && ruleMatch.confidence >= 0.70) {
    return {
      cause: ruleMatch.cause,
      confidence: ruleMatch.confidence,
      method: 'rule_based',
      reasoning: ruleMatch.reasoning,
      requiresManualReview: false,
      llmCalled: false
    };
  }

  // C: Check LLM tie-break cap
  const maxPerBatch = Number(process.env.LLM_TIEBREAK_MAX_PER_BATCH) || 25;
  if (batchLlmCallCount >= maxPerBatch) {
    return {
      cause: 'unknown',
      confidence: 0,
      method: 'fallback_unknown',
      reasoning: 'LLM tie-break batch limit reached; routed for manual review.',
      requiresManualReview: true,
      llmCalled: false
    };
  }

  // E: Check local SHA-256 cache
  const cacheKey = computeCacheKey(input.error_code, input.error_message);
  const cache = loadCache();
  if (cache[cacheKey]) {
    const hit = cache[cacheKey];
    return {
      cause: hit.cause,
      confidence: hit.confidence,
      method: 'llm_tiebreak',
      reasoning: hit.reasoning,
      requiresManualReview: hit.cause === 'unknown' || hit.confidence < 0.70,
      llmCalled: true,
      llmProvider: hit.provider,
      llmModel: hit.model
    };
  }

  // F: Try calling configured LLM (NVIDIA)
  batchLlmCallCount++;
  const llmResult = await classifyWithConfiguredLlm(input);

  if (llmResult) {
    // Save to cache
    saveCache(cacheKey, {
      cause: llmResult.cause,
      confidence: llmResult.confidence,
      reasoning: llmResult.reasoning,
      provider: 'nvidia',
      model: llmResult.model,
      cached_at: new Date().toISOString()
    });

    return {
      cause: llmResult.cause,
      confidence: llmResult.confidence,
      method: 'llm_tiebreak',
      reasoning: llmResult.reasoning,
      requiresManualReview: llmResult.cause === 'unknown' || llmResult.confidence < 0.70,
      llmCalled: true,
      llmProvider: 'nvidia',
      llmModel: llmResult.model
    };
  }

  // G: Fallback
  return {
    cause: 'unknown',
    confidence: 0,
    method: 'fallback_unknown',
    reasoning: 'No high-confidence rule match; NVIDIA LLM tie-breaker unavailable. Routed for manual review.',
    requiresManualReview: true,
    llmCalled: false
  };
}
