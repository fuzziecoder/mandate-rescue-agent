import { NextRequest, NextResponse } from 'next/server';
import { getAuditLogs } from '@/lib/db';
import { getAllNormalizedTransactions } from '@/lib/normalizers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const causeParam = searchParams.get('cause') || searchParams.get('root_cause') || '';
    const actionParam = searchParams.get('action') || '';
    const outcomeParam = searchParams.get('outcome') || '';
    const classifierParam = searchParams.get('classifier') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10));

    const [auditLogs, normalized] = await Promise.all([
      getAuditLogs(),
      getAllNormalizedTransactions(),
    ]);

    const txMap = new Map(normalized.map(t => [t.id, t]));

    let ruleBasedClassifications = 0;
    let llmTiebreakClassifications = 0;
    let recoveredAudits = 0;
    let stoppedAudits = 0;

    for (const t of normalized) {
      if (t.classifier === 'rule') ruleBasedClassifications++;
      else if (t.classifier === 'llm') llmTiebreakClassifications++;

      if (t.outcome === 'Recovered') recoveredAudits++;
      else if (t.outcome === 'Stopped') stoppedAudits++;
    }

    const items = auditLogs.map(a => {
      const tx = txMap.get(a.transaction_id);
      return {
        audit_id: a.id || `audit_${a.transaction_id}`,
        transaction_id: a.transaction_id,
        customer_id: tx?.customer_id || 'unknown',
        timestamp: a.created_at,
        stage: a.stage,
        classification: tx?.failure_cause || null,
        confidence: tx?.confidence || null,
        action: tx?.action_chosen || null,
        reasoning: tx?.decision_reason || null,
        guardrail_result: tx?.guardrail_reason || (tx?.guardrail_allowed ? 'Passed' : 'Blocked'),
        outcome: tx?.outcome || 'Pending',
        recovered_amount: tx?.recovered_amount || 0,
      };
    });

    let filtered = items;

    if (search) {
      filtered = filtered.filter(i =>
        i.transaction_id.toLowerCase().includes(search) ||
        i.customer_id.toLowerCase().includes(search) ||
        (i.classification && i.classification.toLowerCase().includes(search)) ||
        (i.action && i.action.toLowerCase().includes(search)) ||
        (i.reasoning && i.reasoning.toLowerCase().includes(search))
      );
    }

    if (causeParam && causeParam !== 'all' && causeParam !== 'All') {
      filtered = filtered.filter(i => i.classification === causeParam);
    }

    if (actionParam && actionParam !== 'all' && actionParam !== 'All') {
      filtered = filtered.filter(i => i.action === actionParam);
    }

    if (outcomeParam && outcomeParam !== 'all' && outcomeParam !== 'All') {
      filtered = filtered.filter(i => i.outcome.toLowerCase() === outcomeParam.toLowerCase());
    }

    if (classifierParam && classifierParam !== 'all' && classifierParam !== 'All') {
      const tx = txMap.get(classifierParam);
      filtered = filtered.filter(i => {
        const norm = txMap.get(i.transaction_id);
        return norm?.classifier === classifierParam;
      });
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedData = filtered.slice(startIndex, startIndex + pageSize);

    return NextResponse.json({
      data: paginatedData,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
      summary: {
        totalAuditLogs: auditLogs.length,
        recoveredAudits,
        stoppedAudits,
        ruleBasedClassifications,
        llmTiebreakClassifications,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
