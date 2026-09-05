'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } from '@/components/ui';
import { History, Loader2, Download, Search, Filter } from 'lucide-react';
import Link from 'next/link';

export default function AuditPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [causeFilter, setCauseFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [page, setPage] = useState(1);

  const fetchAuditData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '50',
        search,
        cause: causeFilter,
        outcome: outcomeFilter,
      });
      const res = await fetch(`/api/audit?${params.toString()}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditData();
  }, [page, causeFilter, outcomeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchAuditData();
  };

  const exportData = (format: 'json' | 'csv') => {
    if (!data?.data) return;
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-trail-${Date.now()}.json`;
      a.click();
    } else {
      const headers = ['Audit ID', 'Transaction ID', 'Customer ID', 'Stage', 'Classification', 'Action', 'Outcome', 'Amount Recovered', 'Timestamp'];
      const rows = data.data.map((item: any) => [
        item.audit_id,
        item.transaction_id,
        item.customer_id,
        item.stage,
        item.classification || '',
        item.action || '',
        item.outcome || '',
        item.recovered_amount || 0,
        item.timestamp || '',
      ]);
      const csvContent = [headers.join(','), ...rows.map((r: any) => r.map((c: any) => `"${c}"`).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-trail-${Date.now()}.csv`;
      a.click();
    }
  };

  const logs = data?.data || [];
  const summary = data?.summary || {};
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">System Audit Trail</h1>
          <p className="text-xs text-slate-400 mt-1">Immutable step-by-step pipeline execution traces and compliance logs.</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => exportData('json')}>
            <Download className="h-4 w-4 mr-2" />
            JSON
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportData('csv')}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="bg-slate-950 border border-slate-800 p-3.5 space-y-0.5">
          <p className="text-[10px] text-slate-500 font-mono font-bold uppercase">Total Audit Traces</p>
          <p className="text-xl font-bold font-mono text-white tabular-nums">{summary.totalAuditLogs || 0}</p>
        </Card>
        <Card className="bg-slate-950 border border-slate-800 p-3.5 space-y-0.5">
          <p className="text-[10px] text-slate-500 font-mono font-bold uppercase">Recovered Audits</p>
          <p className="text-xl font-bold font-mono text-emerald-400 tabular-nums">{summary.recoveredAudits || 0}</p>
        </Card>
        <Card className="bg-slate-950 border border-slate-800 p-3.5 space-y-0.5">
          <p className="text-[10px] text-slate-500 font-mono font-bold uppercase">Stopped Audits</p>
          <p className="text-xl font-bold font-mono text-rose-400 tabular-nums">{summary.stoppedAudits || 0}</p>
        </Card>
        <Card className="bg-slate-950 border border-slate-800 p-3.5 space-y-0.5">
          <p className="text-[10px] text-slate-500 font-mono font-bold uppercase">Rule vs LLM Classifiers</p>
          <p className="text-base font-bold font-mono text-cyan-400 tabular-nums">
            {summary.ruleBasedClassifications || 0} Rule / {summary.llmTiebreakClassifications || 0} LLM
          </p>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
        <form onSubmit={handleSearchSubmit} className="flex items-center space-x-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by transaction ID or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-zinc-950/90 border border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-colors"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">Search</Button>
        </form>

        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-mono">
            <Filter className="h-3.5 w-3.5 text-cyan-400" />
            <span>Cause:</span>
          </div>
          <select
            value={causeFilter}
            onChange={(e) => { setCauseFilter(e.target.value); setPage(1); }}
            className="bg-zinc-950/90 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 cursor-pointer transition-colors"
          >
            <option value="all" className="bg-zinc-950 text-slate-200">All Causes</option>
            <option value="insufficient_balance" className="bg-zinc-950 text-slate-200">Insufficient Balance</option>
            <option value="bank_downtime" className="bg-zinc-950 text-slate-200">Bank Downtime</option>
            <option value="mandate_expired" className="bg-zinc-950 text-slate-200">Mandate Expired</option>
            <option value="limit_exceeded" className="bg-zinc-950 text-slate-200">Limit Exceeded</option>
          </select>

          <select
            value={outcomeFilter}
            onChange={(e) => { setOutcomeFilter(e.target.value); setPage(1); }}
            className="bg-zinc-950/90 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 cursor-pointer transition-colors"
          >
            <option value="all" className="bg-zinc-950 text-slate-200">All Outcomes</option>
            <option value="recovered" className="bg-zinc-950 text-slate-200">Recovered</option>
            <option value="pending" className="bg-zinc-950 text-slate-200">Pending</option>
            <option value="still_failed" className="bg-zinc-950 text-slate-200">Failed</option>
            <option value="stopped" className="bg-zinc-950 text-slate-200">Stopped</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <History className="h-5 w-5 text-cyan-400" />
            <span>Audit Trail Entries ({pagination.total})</span>
          </CardTitle>
          <CardDescription>Comprehensive stage execution traces from raw failure ingestion to ledger settlement.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center p-8 text-slate-500">No audit records match the selected filters.</div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 font-mono">
                      <th className="py-3 px-4">TRANSACTION</th>
                      <th className="py-3 px-4">STAGE</th>
                      <th className="py-3 px-4">CAUSE</th>
                      <th className="py-3 px-4">ACTION</th>
                      <th className="py-3 px-4">GUARDRAIL</th>
                      <th className="py-3 px-4">OUTCOME</th>
                      <th className="py-3 px-4">TIMESTAMP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 text-sm">
                    {logs.map((item: any) => (
                      <tr key={item.audit_id} className="hover:bg-slate-900/30">
                        <td className="py-3 px-4">
                          <Link href={`/transactions/${item.transaction_id}`} className="font-mono text-xs text-cyan-400 font-bold hover:underline">
                            {item.transaction_id}
                          </Link>
                          <div className="text-[10px] text-slate-500 font-mono">{item.customer_id}</div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-300 uppercase">
                          {item.stage}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="purple" className="font-mono text-[10px]">
                            {item.classification || 'unclassified'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-300">
                          {item.action || 'N/A'}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-400">
                          {item.guardrail_result}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              item.outcome === 'Recovered'
                                ? 'emerald'
                                : item.outcome === 'Stopped'
                                ? 'rose'
                                : 'amber'
                            }
                            className="font-mono text-[10px]"
                          >
                            {item.outcome}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">
                          {new Date(item.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              <div className="flex justify-between items-center pt-4 border-t border-slate-800 text-xs font-mono text-slate-400">
                <span>Page {pagination.page} of {pagination.totalPages}</span>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
