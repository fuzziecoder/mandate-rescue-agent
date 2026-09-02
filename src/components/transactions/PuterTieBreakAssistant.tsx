"use client";

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '@/components/ui';
import { Sparkles, Loader2, CheckCircle2, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { ALLOWED_FAILURE_CAUSES, FailureCause, AiClassificationSuggestion } from '@/lib/ai/puterTypes';

const PUTER_MODEL = "google/gemini-3.7-flash";

type PuterTieBreakAssistantProps = {
  transactionId: string;
  errorCode: string;
  errorMessage: string;
  bankName?: string;
  amount?: number;
  failedAt?: string;
  mandateStatus?: string;
  currentCause?: string | null;
  currentClassifier?: string | null;
  currentConfidence?: number | null;
  onSuggestionApplied?: () => void;
};

export function PuterTieBreakAssistant({
  transactionId,
  errorCode,
  errorMessage,
  bankName,
  amount,
  failedAt,
  mandateStatus,
  currentCause,
  currentClassifier,
  currentConfidence,
  onSuggestionApplied
}: PuterTieBreakAssistantProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<AiClassificationSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Check if classification is ambiguous or low confidence
  const isAmbiguous = 
    !currentCause ||
    currentCause === 'unknown' ||
    currentCause === 'ambiguous' ||
    currentClassifier === 'fallback_unknown' ||
    (currentConfidence !== null && currentConfidence !== undefined && currentConfidence < 0.70);

  if (!isAmbiguous) {
    return null;
  }

  const handleAskAi = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    setStatusMessage("Requesting an AI classification suggestion…");

    try {
      // Dynamic import Puter.js on user explicit click only
      const { puter } = await import("@heyputer/puter.js");

      const prompt = `You are a narrowly scoped UPI Autopay payment-failure classifier.

Your only task is to select the most likely root cause for one synthetic failed mandate transaction.

You must not:
- suggest recovery actions,
- recommend retries,
- write customer messages,
- decide contact timing,
- make compliance decisions,
- make financial decisions,
- discuss policies,
- output anything other than the requested JSON object.

Allowed causes:
- low_balance
- bank_offline
- expired_mandate
- limit_exceeded
- wrong_debit_date
- unknown

Analyze only the synthetic metadata below.

Return valid JSON only, with exactly this shape:
{
  "cause": "one allowed cause",
  "confidence": 0.0,
  "reasoning": "short explanation under 180 characters"
}

Synthetic transaction metadata:
{
  "error_code": "${errorCode}",
  "error_message": "${errorMessage.replace(/"/g, "'")}",
  "bank_name": "${bankName || ''}",
  "amount": ${amount || 0},
  "failed_at": "${failedAt || ''}",
  "mandate_status": "${mandateStatus || ''}"
}`;

      const response = await puter.ai.chat(prompt, { model: PUTER_MODEL });
      let text = '';
      if (typeof response === 'string') {
        text = response;
      } else if (response && response.message && response.message.content) {
        text = response.message.content;
      } else if (response && (response as any).text) {
        text = (response as any).text;
      }

      if (!text) {
        throw new Error("Empty response received from Puter AI.");
      }

      // Defensive parsing & markdown fence stripping
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const causeStr = String(parsed.cause || '').toLowerCase().trim();
      if (!ALLOWED_FAILURE_CAUSES.includes(causeStr as FailureCause)) {
        throw new Error(`AI returned unallowed cause category: "${causeStr}"`);
      }

      const cause = causeStr as FailureCause;
      let confidence = Number(parsed.confidence);
      if (!Number.isFinite(confidence)) confidence = 0.75;
      confidence = Math.max(0, Math.min(1, confidence));

      let reasoning = String(parsed.reasoning || '').trim();
      if (!reasoning) reasoning = `Puter AI suggested ${cause}`;
      if (reasoning.length > 180) reasoning = reasoning.slice(0, 177) + '...';

      setSuggestion({
        cause,
        confidence,
        reasoning,
        provider: "puter",
        model: PUTER_MODEL,
        generatedAt: new Date().toISOString()
      });
      setStatusMessage(null);
    } catch (err: any) {
      console.error("Puter AI Assist Error:", err);
      setError("Unable to obtain AI suggestion. Manual review state preserved.");
      setStatusMessage(null);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewAction = async (action: 'apply' | 'reject') => {
    if (!suggestion || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/transactions/${transactionId}/ai-classification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestion,
          reviewAction: action
        })
      });
      const data = await res.json();
      if (data.success) {
        setStatusMessage(data.message || (action === 'apply' ? 'Suggestion applied successfully.' : 'Suggestion rejected.'));
        setSuggestion(null);
        if (onSuggestionApplied) {
          onSuggestionApplied();
        }
      } else {
        setError(data.error || 'Failed to submit review action.');
      }
    } catch (err) {
      setError('Network error submitting review action.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="border border-violet-500/30 bg-violet-950/10 p-5 space-y-4 rounded-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-5 w-5 text-violet-400 shrink-0" />
          <h4 className="font-display text-sm font-bold text-white">Ambiguous Error — Optional AI Tie-Break Assistant</h4>
        </div>
        <Badge variant="violet" className="font-mono text-[9px] uppercase tracking-wider">
          Simulation Only
        </Badge>
      </div>

      <div className="text-xs text-slate-300 space-y-1.5 font-mono leading-relaxed">
        <p>Optional AI Assist — simulation only. A Puter sign-in may be required. Only synthetic error metadata is shared.</p>
        <p className="text-[11px] text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 inline-block mr-1 text-emerald-400" />
          Shared: error code, error message, synthetic bank name, amount, timestamp. Not shared: customer identity, contact details, account data, UPI IDs, or payment credentials.
        </p>
        <p className="text-[10px] text-slate-500">One AI classification request is made only after your explicit action.</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-400 text-xs font-mono flex items-center space-x-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {statusMessage && (
        <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-cyan-400 text-xs font-mono">
          {statusMessage}
        </div>
      )}

      {!suggestion && (
        <Button
          variant="outline"
          className="border-violet-500/40 text-violet-300 hover:bg-violet-900/30 font-mono text-xs w-full sm:w-auto"
          onClick={handleAskAi}
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-violet-400" />
              Requesting AI classification suggestion…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4 text-violet-400" />
              Ask AI to classify ambiguity
            </>
          )}
        </Button>
      )}

      {suggestion && (
        <div className="border border-violet-500/40 bg-slate-950/80 p-4 rounded-xl space-y-3">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">Suggested Root Cause</span>
              <div className="text-base font-bold font-mono text-violet-300 mt-0.5">{suggestion.cause}</div>
            </div>
            <Badge variant="amber" className="font-mono text-[9px] uppercase">
              AI suggestion — not yet applied
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs font-mono pt-1">
            <div>
              <span className="text-slate-500 text-[10px]">CONFIDENCE</span>
              <p className="text-white font-bold">{(suggestion.confidence * 100).toFixed(0)}%</p>
            </div>
            <div>
              <span className="text-slate-500 text-[10px]">PROVIDER & MODEL</span>
              <p className="text-slate-300 truncate">{suggestion.provider} ({suggestion.model})</p>
            </div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 text-xs text-slate-300 font-mono">
            <span className="text-slate-500 text-[10px] block mb-1">REASONING</span>
            {suggestion.reasoning}
          </div>

          <div className="flex items-center space-x-3 pt-2">
            <Button
              variant="signal"
              size="sm"
              disabled={submitting}
              onClick={() => handleReviewAction('apply')}
              className="text-xs font-mono"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
              Apply suggestion
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => handleReviewAction('reject')}
              className="text-xs font-mono border-rose-500/40 text-rose-400 hover:bg-rose-950/30"
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Reject
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
