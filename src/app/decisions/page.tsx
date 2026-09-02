'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge } from '@/components/ui';
import { GitCommit, Loader2, Filter } from 'lucide-react';
import Link from 'next/link';

export default function DecisionsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [causeFilter, setCauseFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    fetch('/api/decisions')
      .then((res) => res.json())
      .then((json) => {
        setData(json);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const cases = data?.data || [];
  const summary = data?.summary || {};

  const filteredCases = cases.filter((item: any) => {
    if (actionFilter !== 'all' && item.action_chosen !== actionFilter) return false;
    if (causeFilter !== 'all' && item.transaction.failure_cause !== causeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-white tracking-tight">Decision & Escalation Ladder</h1>
        <p className="text-slate-400 mt-2">Stage 2 recovery decisions, deterministic rules, and reasoning pathways.</p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border border-slate-800 bg-slate-950/40 p-4 space-y-1">
          <p className="text-[10px] text-slate-500 font-mono font-bold uppercase">Total Decisions</p>
          <p className="text-2xl font-extrabold font-mono text-white tabular-nums">{summary.totalDecisions || 0}</p>
        </Card>
        <Card className="border border-slate-800 bg-slate-950/40 p-4 space-y-1">
          <p className="text-[10px] text-slate-500 font-mono font-bold uppercase">Rule-Based Decisions</p>
          <p className="text-2xl font-extrabold font-mono text-sky-400 tabular-nums">{summary.ruleBasedCount || 0}</p>
        </Card>
        <Card className="border border-slate-800 bg-slate-950/40 p-4 space-y-1">
          <p className="text-[10px] text-slate-500 font-mono font-bold uppercase">LLM Tiebreak Decisions</p>
          <p className="text-2xl font-extrabold font-mono text-violet-400 tabular-nums">{summary.llmTiebreakCount || 0}</p>
        </Card>
        <Card className="border border-slate-800 bg-slate-950/40 p-4 space-y-1">
          <p className="text-[10px] text-slate-500 font-mono font-bold uppercase">Stopped / No Action</p>
          <p className="text-2xl font-extrabold font-mono text-rose-400 tabular-nums">{summary.noActionOrStoppedCount || 0}</p>
        </Card>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
        <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
          <Filter className="h-4 w-4 text-cyan-400" />
          <span>Filters:</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-zinc-950/90 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 cursor-pointer transition-colors"
          >
            <option value="all" className="bg-zinc-950 text-slate-200">All Actions</option>
            <option value="retry" className="bg-zinc-950 text-slate-200">Auto Retry</option>
            <option value="nudge" className="bg-zinc-950 text-slate-200">SMS Nudge</option>
            <option value="reauth" className="bg-zinc-950 text-slate-200">Web Reauth</option>
            <option value="stop" className="bg-zinc-950 text-slate-200">Stop</option>
          </select>

          <select
            value={causeFilter}
            onChange={(e) => setCauseFilter(e.target.value)}
            className="bg-zinc-950/90 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 cursor-pointer transition-colors"
          >
            <option value="all" className="bg-zinc-950 text-slate-200">All Causes</option>
            <option value="insufficient_balance" className="bg-zinc-950 text-slate-200">Insufficient Balance</option>
            <option value="bank_downtime" className="bg-zinc-950 text-slate-200">Bank Downtime</option>
            <option value="mandate_expired" className="bg-zinc-950 text-slate-200">Mandate Expired</option>
            <option value="limit_exceeded" className="bg-zinc-950 text-slate-200">Limit Exceeded</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <GitCommit className="h-5 w-5 text-violet-400" />
              <span>Recovery Escalation Ledger ({filteredCases.length})</span>
            </CardTitle>
            <CardDescription>Escalations guided by failure root-cause analysis, customer history, and value thresholds.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
              </div>
            ) : filteredCases.length === 0 ? (
              <div className="text-center p-8 text-slate-500">No decision records match the selected filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 font-mono">
                      <th className="py-3 px-4">TRANSACTION</th>
                      <th className="py-3 px-4">CAUSE</th>
                      <th className="py-3 px-4">ACTION CHOSEN</th>
                      <th className="py-3 px-4">ESCALATION RUNG</th>
                      <th className="py-3 px-4">REASONING & WHY</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850 text-sm">
                    {filteredCases.map((item: any) => (
                      <tr key={item.transaction.id} className="hover:bg-slate-900/30 transition-colors">
                        <td className="py-3 px-4">
                          <Link href={`/transactions/${item.transaction.id}`} className="font-mono text-xs text-cyan-400 font-bold hover:underline">
                            {item.transaction.id}
                          </Link>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">₹{item.transaction.amount.toLocaleString('en-IN')}</div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="purple" className="font-mono text-[10px]">
                            {item.transaction.failure_cause || 'unknown'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              item.action_chosen === 'retry'
                                ? 'emerald'
                                : item.action_chosen === 'nudge'
                                ? 'cyan'
                                : item.action_chosen === 'reauth'
                                ? 'purple'
                                : 'rose'
                            }
                            className="font-mono text-[10px] uppercase font-bold"
                          >
                            {item.action_chosen}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-300">
                          {item.escalation_rung}
                        </td>
                        <td className="py-3 px-4 max-w-md">
                          <p className="text-xs text-slate-300 font-mono">{item.decision_reason}</p>
                          <div className="text-[10px] text-slate-500 font-mono mt-1">
                            Classifier: {item.transaction.classifier || 'rule'} ({((item.transaction.confidence || 1) * 100).toFixed(0)}% confidence)
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
