import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import {
  getTransactions,
  getClassifications,
  getDecisions,
  getGuardrailChecks,
  getExecutions,
  getAuditLogs,
  getLedgerEntries,
} from '@/lib/db';
import { getAllNormalizedTransactions } from '@/lib/normalizers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const causeParam = searchParams.get('cause') || '';
    const outcomeParam = searchParams.get('outcome') || '';
    const classifierParam = searchParams.get('classifier') || '';
    const debug = searchParams.get('debug') === 'true';

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10));
    const sortBy = searchParams.get('sortBy') || 'failed_at';
    const sortDirection = searchParams.get('sortDirection') || 'desc';

    const [
      txs,
      classifications,
      decisions,
      guardrailChecks,
      executions,
      auditLogs,
      ledgerEntries,
      allNormalized,
    ] = await Promise.all([
      getTransactions(),
      getClassifications(),
      getDecisions(),
      getGuardrailChecks(),
      getExecutions(),
      getAuditLogs(),
      getLedgerEntries(),
      getAllNormalizedTransactions(),
    ]);

    let filtered = allNormalized;

    // Filter by search
    if (search) {
      filtered = filtered.filter(t =>
        t.id.toLowerCase().includes(search) ||
        t.customer_id.toLowerCase().includes(search) ||
        t.mandate_id.toLowerCase().includes(search) ||
        t.bank_name.toLowerCase().includes(search) ||
        t.error_code.toLowerCase().includes(search) ||
        t.error_message.toLowerCase().includes(search) ||
        t.subscription_type.toLowerCase().includes(search)
      );
    }

    // Filter by cause (treat 'all', 'All', '' as no filter)
    if (causeParam && causeParam !== 'all' && causeParam !== 'All') {
      filtered = filtered.filter(t => t.failure_cause === causeParam);
    }

    // Filter by outcome (treat 'all', 'All', '' as no filter)
    if (outcomeParam && outcomeParam !== 'all' && outcomeParam !== 'All') {
      filtered = filtered.filter(t => t.outcome.toLowerCase() === outcomeParam.toLowerCase());
    }

    // Filter by classifier (treat 'all', 'All', '' as no filter)
    if (classifierParam && classifierParam !== 'all' && classifierParam !== 'All') {
      filtered = filtered.filter(t => t.classifier === classifierParam);
    }

    // Sorting
    filtered.sort((a: any, b: any) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      return sortDirection === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedData = filtered.slice(startIndex, startIndex + pageSize);

    const dbPath = path.join(process.cwd(), 'data', 'db.json');

    const debugInfo = {
      dbPath,
      transactionCount: txs.length,
      classificationCount: classifications.length,
      decisionCount: decisions.length,
      guardrailCount: guardrailChecks.length,
      executionCount: executions.length,
      auditCount: auditLogs.length,
      ledgerCount: ledgerEntries.length,
    };

    return NextResponse.json({
      success: true,
      data: paginatedData,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
      debug: debugInfo,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
