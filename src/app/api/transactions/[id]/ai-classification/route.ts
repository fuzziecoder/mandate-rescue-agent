import { NextResponse } from 'next/server';
import { getTransactionById, saveClassification, saveAuditLog } from '@/lib/db';
import { ALLOWED_FAILURE_CAUSES, FailureCause } from '@/lib/ai/puterTypes';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const transaction = await getTransactionById(id);
    if (!transaction) {
      return NextResponse.json({ success: false, error: 'Transaction not found' }, { status: 404 });
    }

    const body = await request.json();
    const { suggestion, reviewAction } = body || {};

    if (!suggestion || !reviewAction) {
      return NextResponse.json({ success: false, error: 'Missing suggestion or reviewAction' }, { status: 400 });
    }

    if (reviewAction !== 'apply' && reviewAction !== 'reject') {
      return NextResponse.json({ success: false, error: 'reviewAction must be apply or reject' }, { status: 400 });
    }

    const cause = String(suggestion.cause || '').toLowerCase().trim();
    if (!ALLOWED_FAILURE_CAUSES.includes(cause as FailureCause)) {
      return NextResponse.json({ success: false, error: 'Invalid or disallowed failure cause' }, { status: 400 });
    }

    let confidence = Number(suggestion.confidence);
    if (!Number.isFinite(confidence)) {
      return NextResponse.json({ success: false, error: 'Confidence must be a valid number' }, { status: 400 });
    }
    confidence = Math.max(0, Math.min(1, confidence));

    let reasoning = String(suggestion.reasoning || '').trim();
    if (reasoning.length > 180) {
      reasoning = reasoning.slice(0, 177) + '...';
    }

    if (suggestion.provider !== 'puter') {
      return NextResponse.json({ success: false, error: 'Provider must equal puter' }, { status: 400 });
    }

    const model = String(suggestion.model || 'google/gemini-3.7-flash').slice(0, 120);
    const isApplied = reviewAction === 'apply';

    // 1. Audit event
    await saveAuditLog({
      transaction_id: id,
      stage: 'ai_tiebreak_review' as any,
      payload: {
        event_type: 'puter_ai_suggestion_reviewed',
        review_action: reviewAction,
        suggested_cause: cause,
        suggested_confidence: confidence,
        suggested_reasoning: reasoning,
        provider: 'puter',
        model,
        applied: isApplied,
        message: isApplied
          ? 'User-reviewed optional Puter AI classification suggestion applied to ambiguous synthetic transaction.'
          : 'User-reviewed optional Puter AI classification suggestion rejected.'
      },
      created_at: new Date().toISOString()
    });

    // 2. If applied, update classification record
    if (isApplied) {
      await saveClassification({
        transaction_id: id,
        predicted_cause: cause as any,
        confidence,
        reasoning_text: reasoning,
        method: 'puter_ai_assist' as any,
        manual_review_required: false,
        reviewed_by_user: true,
        llm_called: true
      });

      return NextResponse.json({
        success: true,
        message: 'AI classification applied. Re-run the deterministic pipeline explicitly to continue recovery simulation.'
      });
    }

    return NextResponse.json({
      success: true,
      message: 'AI classification suggestion rejected. Transaction preserved in manual review state.'
    });

  } catch (error: any) {
    console.error('Error handling AI classification review:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
