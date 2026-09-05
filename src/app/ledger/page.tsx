'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } from '@/components/ui';
import { ShieldCheck, AlertCircle, RefreshCw, Layers } from 'lucide-react';
import Link from 'next/link';

export default function LedgerPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ledger');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  const summary = data?.summary || {};
  const entries = data?.entries || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">The Recovery Ledger</h1>
          <p className="text-xs text-slate-400 mt-1">Immutable financial source of truth for all recovered subscription revenue.</p>
        </div>
        <div className="flex items-center space-x-3">
          <Badge
            variant={summary.ledgerBalanced ? 'emerald' : 'rose'}
            className="font-mono text-xs px-3 py-1 flex items-center space-x-1.5"
          >
            {summary.ledgerBalanced ? (
              <>
                <ShieldCheck className="h-4 w-4" />
                <span>Ledger balanced ✓</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4" />
                <span>Ledger needs reconciliation</span>
              </>
            )}
          </Badge>
          <Button onClick={fetchLedger} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Reconciliation Warning if duplicate IDs exist */}
      {summary.duplicateTransactionIds && summary.duplicateTransactionIds.length > 0 && (
        <Card className="border-rose-500/30 bg-rose-950/20 p-4">
          <div className="flex items-center space-x-3 text-rose-400 text-xs font-mono">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-bold">Duplicate transaction IDs detected in ledger ({summary.duplicateTransactionIds.length}):</p>
              <p className="text-rose-300 mt-0.5">{summary.duplicateTransactionIds.join(', ')}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Summary KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-zinc-950 border border-zinc-800/80 p-6 space-y-1">
          <p className="text-xs text-slate-500 font-mono">TOTAL RECOVERED</p>
          <p className="text-3xl font-bold font-mono text-emerald-400 tabular-nums">
            ₹{(summary.totalRecovered || 0).toLocaleString('en-IN')}
          </p>
        </Card>
        <Card className="bg-zinc-950 border border-zinc-800/80 p-6 space-y-1">
          <p className="text-xs text-slate-500 font-mono">TOTAL VOLUME AT RISK</p>
          <p className="text-3xl font-bold font-mono text-white tabular-nums">
            ₹{(summary.totalAtRisk || 0).toLocaleString('en-IN')}
          </p>
        </Card>
        <Card className="bg-zinc-950 border border-zinc-800/80 p-6 space-y-1 border-l-rose-500/80 border-l-4">
          <p className="text-xs text-slate-500 font-mono text-rose-400">NET UNRESOLVED AT RISK</p>
          <p className="text-3xl font-bold font-mono text-rose-500 tabular-nums">
            ₹{(summary.netAtRisk || 0).toLocaleString('en-IN')}
          </p>
        </Card>
        <Card className="bg-zinc-950 border border-zinc-800/80 p-6 space-y-1">
          <p className="text-xs text-slate-500 font-mono">RECOVERY RATE</p>
          <p className="text-3xl font-bold font-mono text-cyan-400 tabular-nums">
            {(summary.recoveryRate || 0).toFixed(1)}%
          </p>
        </Card>
      </div>

      {/* Ledger Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Layers className="h-5 w-5 text-emerald-400" />
            <span>Immutable Settlement Ledger ({entries.length} Entries)</span>
          </CardTitle>
          <CardDescription>Verified successful transaction recoveries posted directly by executor pipeline.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <RefreshCw className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center p-8 text-slate-500">No recovery entries posted in the ledger yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 font-mono">
                    <th className="py-3 px-4">ENTRY ID</th>
                    <th className="py-3 px-4">TRANSACTION</th>
                    <th className="py-3 px-4">AMOUNT</th>
                    <th className="py-3 px-4">ROOT CAUSE</th>
                    <th className="py-3 px-4">ACTION USED</th>
                    <th className="py-3 px-4">CHANNEL</th>
                    <th className="py-3 px-4">TIMESTAMP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-sm">
                  {entries.map((entry: any) => (
                    <tr key={entry.id || entry.transaction_id} className="hover:bg-slate-900/30">
                      <td className="py-3 px-4 font-mono text-xs text-slate-400">{entry.id}</td>
                      <td className="py-3 px-4">
                        <Link href={`/transactions/${entry.transaction_id}`} className="font-mono text-xs text-cyan-400 font-bold hover:underline">
                          {entry.transaction_id}
                        </Link>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-emerald-400 font-bold">
                        ₹{entry.amount.toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="purple" className="font-mono text-[10px]">
                          {entry.root_cause}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-300">
                        {entry.recovery_action_used}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-400">
                        {entry.channel}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">
                        {new Date(entry.timestamp).toLocaleString()}
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
  );
}
