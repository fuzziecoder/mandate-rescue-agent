import { NextResponse } from 'next/server';
import {
  getTransactionById,
  upsertClassification,
  appendAuditLog,
} from '@/lib/db';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 });
    }

    const transaction = await getTransactionById(id);
    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { suggestion, reviewAction } = body || {};

    if (!suggestion || !reviewAction) {
      return NextResponse.json({ error: 'Missing suggestion or reviewAction' }, { status: 400 });
    }

    if (reviewAction !== 'apply' && reviewAction !== 'reject') {
      return NextResponse.json({ error: 'reviewAction must be apply or reject' }, { status: 400 });
    }

    const allowedCauses = [
      'low_balance',
      'bank_offline',
      'expired_mandate',
      'limit_exceeded',
      'wrong_debit_date',
      'unknown',
    ];

    const validatedCause = String(suggestion.cause || '').toLowerCase().trim();
    if (!allowedCauses.includes(validatedCause)) {
      return NextResponse.json({ error: 'Invalid failure cause' }, { status: 400 });
    }

    const validatedConfidence = Number(suggestion.confidence);
    if (!Number.isFinite(validatedConfidence) || validatedConfidence < 0 || validatedConfidence > 1) {
      return NextResponse.json({ error: 'Confidence must be a finite number between 0 and 1' }, { status: 400 });
    }

    const rawReasoning = String(suggestion.reasoning || '').trim();
    if (!rawReasoning) {
      return NextResponse.json({ error: 'Reasoning must be non-empty plain text' }, { status: 400 });
    }
    const validatedReasoning = rawReasoning.slice(0, 180);

    if (suggestion.provider !== 'puter') {
      return NextResponse.json({ error: 'Provider must equal puter' }, { status: 400 });
    }

    const validatedModel = String(suggestion.model || 'google/gemini-3.7-flash').slice(0, 120);

    const nowIso = new Date().toISOString();

    if (reviewAction === 'reject') {
      await appendAuditLog({
        id: `audit_ai_rej_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        transaction_id: id,
        stage: 'ai_tiebreak_review',
        event_type: 'puter_ai_suggestion_reviewed',
        review_action: 'reject',
        suggested_cause: validatedCause,
        suggested_confidence: validatedConfidence,
        suggested_reasoning: validatedReasoning,
        provider: 'puter',
        model: validatedModel,
        applied: false,
        timestamp: nowIso,
        created_at: nowIso,
      });

      return NextResponse.json({
        ok: true,
        success: true,
        message: 'AI classification suggestion rejected. Transaction preserved in current state.',
      });
    }

    // reviewAction === 'apply'
    const savedClassification = await upsertClassification({
      transaction_id: id,
      predicted_cause: validatedCause,
      cause: validatedCause,
      confidence: validatedConfidence,
      method: 'puter_ai_assist',
      reasoning_text: validatedReasoning,
      reasoning: validatedReasoning,
      llm_called: true,
      llm_provider: 'puter',
      llm_model: validatedModel,
      manual_review_required: false,
      reviewed_by_user: true,
      updated_at: nowIso,
    });

    await appendAuditLog({
      id: `audit_ai_app_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      transaction_id: id,
      stage: 'ai_tiebreak_review',
      event_type: 'puter_ai_suggestion_reviewed',
      review_action: 'apply',
      suggested_cause: validatedCause,
      suggested_confidence: validatedConfidence,
      suggested_reasoning: validatedReasoning,
      provider: 'puter',
      model: validatedModel,
      applied: true,
      timestamp: nowIso,
      created_at: nowIso,
    });

    return NextResponse.json({
      ok: true,
      success: true,
      message: 'AI classification applied. Re-run the deterministic recovery pipeline explicitly to continue simulation.',
      classification: savedClassification,
    });
  } catch (error: any) {
    console.error(`[AI Classification API Error]`, error?.message || error);
    return NextResponse.json(
      { error: 'Could not apply AI classification suggestion.' },
      { status: 500 }
    );
  }
}
