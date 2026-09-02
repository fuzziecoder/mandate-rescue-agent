'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } from '@/components/ui';
import { Calendar, Loader2, Info } from 'lucide-react';

export default function PromisesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/promises')
      .then((res) => res.json())
      .then((json) => {
        setData(json);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const summary = data?.summary || {
    total: 0,
    pending: 0,
    kept: 0,
    broken: 0,
    due: 0,
    recoveredFromPromises: 0,
  };

  const promisesList = data?.data || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-white tracking-tight">Promise to Pay (P2P) Tracking</h1>
        <p className="text-slate-400 mt-2">Monitor customer P2P commitments and scheduled repayment tracking.</p>
      </div>

      {/* Summary KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="bg-zinc-950 border border-zinc-800/80 p-6 space-y-1">
          <p className="text-xs text-slate-500 font-mono">TOTAL P2P COMMITMENTS</p>
          <p className="text-3xl font-bold font-mono text-white tabular-nums">{summary.total}</p>
        </Card>
        <Card className="bg-zinc-950 border border-zinc-800/80 p-6 space-y-1">
          <p className="text-xs text-slate-500 font-mono">PENDING DUE</p>
          <p className="text-3xl font-bold font-mono text-cyan-400 tabular-nums">{summary.pending}</p>
        </Card>
        <Card className="bg-zinc-950 border border-zinc-800/80 p-6 space-y-1">
          <p className="text-xs text-slate-500 font-mono">KEPT COMMITMENTS</p>
          <p className="text-3xl font-bold font-mono text-emerald-400 tabular-nums">{summary.kept}</p>
        </Card>
        <Card className="bg-zinc-950 border border-zinc-800/80 p-6 space-y-1">
          <p className="text-xs text-slate-500 font-mono">RECOVERED VOLUME</p>
          <p className="text-3xl font-bold font-mono text-purple-400 tabular-nums">
            ₹{summary.recoveredFromPromises.toLocaleString('en-IN')}
          </p>
        </Card>
      </div>

      {/* Main Content */}
      <Card className="border border-zinc-800 bg-zinc-950">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-white">
            <Calendar className="h-5 w-5 text-purple-400" />
            <span>P2P Commitment Ledger</span>
          </CardTitle>
          <CardDescription>
            Promises captured when users indicate intent to top-up accounts or pay on a future date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            </div>
          ) : promisesList.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-400">
                <Info className="h-6 w-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-sm font-semibold text-white">No P2P Commitments Captured Yet</h3>
                <p className="text-xs text-slate-400 leading-relaxed font-mono">
                  {data?.emptyState || 'No promise-to-pay commitments have been captured in this simulation batch yet.'}
                </p>
              </div>
              <Button disabled variant="outline" size="sm" className="border-slate-800 text-slate-500">
                Requires Incoming Customer Commitment
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 font-mono">
                    <th className="py-3 px-4">PROMISE ID</th>
                    <th className="py-3 px-4">TRANSACTION</th>
                    <th className="py-3 px-4">AMOUNT</th>
                    <th className="py-3 px-4">PROMISED DATE</th>
                    <th className="py-3 px-4">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-sm">
                  {promisesList.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-900/30">
                      <td className="py-3 px-4 font-mono text-xs text-white">{p.id}</td>
                      <td className="py-3 px-4 font-mono text-xs text-cyan-400">{p.transaction_id}</td>
                      <td className="py-3 px-4 font-mono text-xs text-emerald-400">₹{p.amount}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-300">{p.promised_date}</td>
                      <td className="py-3 px-4">
                        <Badge variant={p.status === 'kept' ? 'emerald' : p.status === 'broken' ? 'rose' : 'cyan'}>
                          {p.status}
                        </Badge>
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
