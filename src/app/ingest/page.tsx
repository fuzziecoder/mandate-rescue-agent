'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '@/components/ui';
import { Loader2, Play, Sparkles, Database, CheckCircle2, Terminal } from 'lucide-react';

export default function IngestPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [ingestionCompleted, setIngestionCompleted] = useState(false);

  const fetchIngestData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ingest');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIngestData();
  }, []);

  const handleRunDetection = async () => {
    setRunning(true);
    setIngestionCompleted(false);
    try {
      const res = await fetch('/api/overview');
      const json = await res.json();
      if (json) {
        setIngestionCompleted(true);
        fetchIngestData();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center space-x-3">
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">Detection & Ingest Layer</h1>
          <Badge variant="cyan" className="font-mono text-xs">Synthetic Data Source</Badge>
        </div>
        <p className="text-xs text-slate-400 mt-1">Onboard failed mandates and inspect incoming transaction metadata.</p>
      </div>

      {/* Terminal instruction callout */}
      <Card className="border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Terminal className="h-5 w-5 text-cyan-400 shrink-0" />
            <div className="space-y-0.5">
              <p className="text-xs font-mono text-slate-300">Generate / Reset Synthetic Dataset</p>
              <code className="text-xs font-mono text-cyan-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                npx tsx scripts/generate-data.ts
              </code>
            </div>
          </div>
          <Badge variant="slate" className="font-mono text-[10px] text-slate-400">Local JSON Storage</Badge>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Database className="h-5 w-5 text-sky-400" />
              <span>Ingested Failure Batches</span>
            </CardTitle>
            <CardDescription>Failed subscription mandates detected from payment service providers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
              </div>
            ) : !data || data.totalTransactions === 0 ? (
              <div className="text-center p-8 text-slate-500">No failure records found. Run <code className="font-mono text-cyan-400">npx tsx scripts/generate-data.ts</code></div>
            ) : (
              <div className="space-y-6">
                {/* Synthetic Batch Record */}
                {data.batches?.map((b: any, idx: number) => (
                  <div key={idx} className="border border-slate-800 bg-slate-950/40 rounded-xl p-6 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center space-x-2">
                          <h4 className="font-mono text-sm font-bold text-white">{b.batchId}</h4>
                          <Badge variant="purple" className="text-[9px] uppercase font-mono">Synthetic Source</Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Detected span: {data.oldestFailureAt ? new Date(data.oldestFailureAt).toLocaleDateString() : 'N/A'} - {data.newestFailureAt ? new Date(data.newestFailureAt).toLocaleDateString() : 'N/A'}</p>
                      </div>
                      <Badge variant={b.status === 'Completed' ? 'emerald' : 'amber'}>
                        {b.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                      <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                        <p className="text-[10px] text-slate-500 font-mono">TOTAL INGESTED</p>
                        <p className="text-2xl font-bold font-mono text-white mt-1 tabular-nums">{b.totalRecords}</p>
                      </div>
                      <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                        <p className="text-[10px] text-slate-500 font-mono">PROCESSED</p>
                        <p className="text-2xl font-bold font-mono text-emerald-400 mt-1 tabular-nums">{b.processedRecords}</p>
                      </div>
                      <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
                        <p className="text-[10px] text-slate-500 font-mono">PENDING</p>
                        <p className="text-2xl font-bold font-mono text-amber-400 mt-1 tabular-nums">{b.totalRecords - b.processedRecords}</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Error Code Breakdown */}
                <div>
                  <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-3">Failure Error Code Breakdown</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(data.transactionsByErrorCode || {}).map(([code, count]: [string, any]) => (
                      <div key={code} className="flex justify-between items-center p-3 rounded-lg bg-slate-900/40 border border-slate-800/60 text-xs">
                        <span className="font-mono text-slate-300">{code}</span>
                        <span className="font-mono font-bold text-white tabular-nums">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bank Distribution */}
                <div>
                  <h4 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-3">Bank Volume Distribution</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(data.transactionsByBank || {}).map(([bank, count]: [string, any]) => (
                      <div key={bank} className="p-3 rounded-lg bg-slate-900/40 border border-slate-800/60 text-xs">
                        <p className="text-slate-400 truncate">{bank}</p>
                        <p className="text-lg font-bold font-mono text-cyan-400 mt-1 tabular-nums">{count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-violet-400" />
              <span>Classification Engine</span>
            </CardTitle>
            <CardDescription>Deterministic rules + LLM tie-breakers to evaluate failure causes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 flex-grow">
            <p className="text-sm text-slate-400 leading-relaxed">
              Detection is the first stage in recovery. We parse standard error codes and evaluate root causes before selecting an action.
            </p>
            {ingestionCompleted && (
              <div className="flex items-center space-x-2 text-emerald-400 text-sm font-semibold bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <span>Detection refresh complete!</span>
              </div>
            )}
          </CardContent>
          <div className="p-6 pt-0 border-t border-slate-800/50 mt-4">
            <Button
              className="w-full"
              variant="signal"
              disabled={running || !data || data.totalTransactions === 0}
              onClick={handleRunDetection}
            >
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing Detection...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4 fill-current" />
                  Refresh Ingestion Feed
                </>
              )}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
