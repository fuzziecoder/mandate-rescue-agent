'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Play, 
  AlertTriangle, 
  CheckCircle2, 
  ShieldAlert, 
  ArrowRight, 
  Loader2, 
  Sparkles,
  TrendingUp,
  Activity,
  X,
  RefreshCw,
  Pause
} from 'lucide-react';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  Button, 
  Progress, 
  Badge,
  Skeleton
} from '@/components/ui';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  CartesianGrid
} from 'recharts';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LiveMetrics {
  recovered: number;
  failed: number;
  stopped: number;
  pending: number;
  nudgesBlocked: number;
}

interface BatchStatusState {
  id: string | null;
  status: 'idle' | 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  progress: number;          // 0–100
  totalCount: number;
  processedCount: number;
  currentStage: string;
  currentTxIndex: number;
  liveMetrics: LiveMetrics;
  metrics: any;              // overview metrics
  recentEvents: string[];    // live event feed from batch engine
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  idle: 'Idle',
  starting: 'Starting',
  classify: 'Classify',
  decide: 'Decide',
  guardrails: 'Guardrails',
  execute: 'Execute',
  saved: 'Saved',
  completed: 'Done',
  failed: 'Failed',
};

const STAGE_COLORS: Record<string, string> = {
  classify: 'text-violet-400',
  decide: 'text-blue-400',
  guardrails: 'text-amber-400',
  execute: 'text-emerald-400',
  saved: 'text-cyan-400',
  starting: 'text-slate-400',
  completed: 'text-emerald-400',
  failed: 'text-rose-400',
  idle: 'text-slate-400',
};

const formatCurrency = (amt: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amt);

// ─── Custom chart tooltip ──────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-lg border border-slate-800 bg-[#131B2E] p-2.5 shadow-md">
        <p className="text-[10px] font-semibold text-slate-300 font-display uppercase tracking-wider">{data.name}</p>
        <div className="mt-1.5 space-y-0.5 text-xs font-mono text-slate-100">
          <p>At Risk: <span className="text-slate-400">₹{data.atRisk.toLocaleString('en-IN')}</span></p>
          <p>Recovered: <span className="text-emerald-400">₹{data.recovered.toLocaleString('en-IN')}</span></p>
          <p>Rate: <span className="text-cyan-400 font-bold">{data.rate.toFixed(1)}%</span></p>
          <p>Transactions: <span className="text-slate-400">{data.count}</span></p>
        </div>
      </div>
    );
  }
  return null;
};

// ─── Summary Modal ─────────────────────────────────────────────────────────────

function SummaryModal({ metrics, liveMetrics, onClose }: {
  metrics: any;
  liveMetrics: LiveMetrics;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose} />
      
      {/* Modal Card */}
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl animate-fade-in overflow-hidden ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800/80 bg-zinc-900/50">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-md shadow-emerald-500/10">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-display tracking-tight">Batch Complete</h2>
              <p className="text-xs text-zinc-400 font-mono">Recovery pipeline executed successfully</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Hero metric */}
          <div className="rounded-xl bg-gradient-to-br from-emerald-950/40 via-zinc-900/60 to-cyan-950/30 border border-emerald-500/30 p-5 text-center shadow-lg">
            <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-mono font-bold mb-1">Total Recovered Revenue</p>
            <p className="text-4xl font-extrabold text-emerald-400 tabular-nums font-display tracking-tight drop-shadow-[0_0_12px_rgba(16,185,129,0.25)]">
              {formatCurrency(metrics?.totalRecovered || 0)}
            </p>
            <p className="text-xs text-zinc-400 font-medium mt-1.5">
              <span className="text-cyan-400 font-bold font-mono">{((metrics?.totalRecovered || 0) / (metrics?.totalAtRisk || 1) * 100).toFixed(1)}%</span> of {formatCurrency(metrics?.totalAtRisk || 0)} total at risk
            </p>
          </div>

          {/* Counter grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3.5">
              <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-mono font-bold">Recovered</p>
              <p className="text-2xl font-extrabold text-emerald-400 font-display tabular-nums mt-1">{liveMetrics.recovered}</p>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">mandates saved</p>
            </div>
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.04] p-3.5">
              <p className="text-[10px] uppercase tracking-wider text-rose-400 font-mono font-bold">Still Failed</p>
              <p className="text-2xl font-extrabold text-rose-400 font-display tabular-nums mt-1">{liveMetrics.failed}</p>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">need manual review</p>
            </div>
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/[0.04] p-3.5">
              <p className="text-[10px] uppercase tracking-wider text-orange-400 font-mono font-bold">Stopped by Guardrails</p>
              <p className="text-2xl font-extrabold text-orange-400 font-display tabular-nums mt-1">{liveMetrics.stopped}</p>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">compliance enforced</p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3.5">
              <p className="text-[10px] uppercase tracking-wider text-amber-400 font-mono font-bold">Nudges Blocked</p>
              <p className="text-2xl font-extrabold text-amber-400 font-display tabular-nums mt-1">{liveMetrics.nudgesBlocked}</p>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5">guardrail interventions</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl border border-zinc-700 bg-zinc-900 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all"
            >
              Close
            </button>
            <Link href="/transactions" className="flex-1" onClick={onClose}>
              <button className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/35 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center space-x-2">
                <span>Browse Audit Trails</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Live Pipeline Status Block ───────────────────────────────────────────────

function PipelineStatusBlock({
  status,
  processedCount,
  totalCount,
  currentStage,
  liveMetrics,
  metrics,
  recentEvents = [],
  onRun,
  onResume
}: {
  status: BatchStatusState['status'];
  processedCount: number;
  totalCount: number;
  currentStage: string;
  liveMetrics: LiveMetrics;
  metrics: any;
  recentEvents?: string[];
  onRun: () => void;
  onResume: () => void;
}) {
  const progress = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

  if (status === 'idle') {
    return (
      <div className="space-y-4 text-center py-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 border border-slate-800">
          <Play className="h-5 w-5 text-slate-400" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-white">Pipeline Idle</h4>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            {totalCount > 0 ? `${totalCount} failed Autopay mandates loaded. Recovery engine has not run yet.` : 'No transactions loaded.'}
          </p>
        </div>
        <Button variant="signal" className="w-full" onClick={onRun}>
          Run Batch Engine
        </Button>
      </div>
    );
  }

  if (status === 'paused') {
    return (
      <div className="space-y-4 text-center py-6">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-950/40 border border-amber-500/30">
          <Pause className="h-5 w-5 text-amber-400" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-amber-400 font-mono uppercase">Batch Paused</h4>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Batch paused at <strong className="text-white font-mono">{processedCount} / {totalCount}</strong>. Global dispatch kill-switch is active.
          </p>
        </div>
        <Button variant="outline" className="w-full border-amber-500/30 text-amber-400 hover:bg-amber-500/10" onClick={onResume}>
          Enable Dispatch & Resume Batch
        </Button>
      </div>
    );
  }

  if (status === 'running' || status === 'queued') {
    return (
      <div className="space-y-5 py-2">
        {/* Ticker */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wider font-mono text-cyan-400 flex items-center">
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            RUNNING PIPELINE
          </span>
          <span className={`text-xs font-mono font-bold uppercase ${STAGE_COLORS[currentStage]}`}>
            ▶ {STAGE_LABELS[currentStage]}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-[10px] font-mono text-slate-500">
            <span>Processing <span className="text-white font-bold">{processedCount}</span> / {totalCount}</span>
            <span className="text-cyan-400 font-bold">{progress}%</span>
          </div>
        </div>

        {/* Stage pipeline visualization */}
        <div className="flex items-center justify-between text-[10px] font-mono">
          {(['classify', 'decide', 'guardrails', 'execute'] as const).map((stage, idx) => {
            const isActive = currentStage === stage;
            const stageOrder = ['classify', 'decide', 'guardrails', 'execute'];
            const currentIdx = stageOrder.indexOf(currentStage);
            const isDone = currentIdx > idx;
            return (
              <React.Fragment key={stage}>
                <div className={`flex flex-col items-center gap-1 transition-all duration-300 ${
                  isActive ? 'scale-110' : ''
                }`}>
                  <div className={`h-6 w-6 rounded-full flex items-center justify-center border transition-all duration-300 ${
                    isActive 
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.4)]' 
                      : isDone
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-900 border-slate-700 text-slate-600'
                  }`}>
                    {isDone ? '✓' : idx + 1}
                  </div>
                  <span className={isActive ? STAGE_COLORS[stage] : isDone ? 'text-emerald-400/60' : 'text-slate-600'}>
                    {STAGE_LABELS[stage]}
                  </span>
                </div>
                {idx < 3 && (
                  <div className={`flex-1 h-px mx-1 transition-all duration-500 ${
                    isDone ? 'bg-emerald-500/30' : 'bg-slate-800'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Live counters */}
        <div className="grid grid-cols-4 gap-1.5">
          <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-lg p-2 text-center">
            <p className="text-[8px] uppercase tracking-wider text-emerald-400 font-mono">Saved</p>
            <p className="text-lg font-bold text-emerald-400 tabular-nums leading-tight">{liveMetrics.recovered}</p>
          </div>
          <div className="bg-rose-500/[0.06] border border-rose-500/20 rounded-lg p-2 text-center">
            <p className="text-[8px] uppercase tracking-wider text-rose-400 font-mono">Failed</p>
            <p className="text-lg font-bold text-rose-400 tabular-nums leading-tight">{liveMetrics.failed}</p>
          </div>
          <div className="bg-orange-500/[0.06] border border-orange-500/20 rounded-lg p-2 text-center">
            <p className="text-[8px] uppercase tracking-wider text-orange-400 font-mono">Stopped</p>
            <p className="text-lg font-bold text-orange-400 tabular-nums leading-tight">{liveMetrics.stopped}</p>
          </div>
          <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-lg p-2 text-center">
            <p className="text-[8px] uppercase tracking-wider text-amber-400 font-mono">Blocked</p>
            <p className="text-lg font-bold text-amber-400 tabular-nums leading-tight">{liveMetrics.nudgesBlocked}</p>
          </div>
        </div>

        {/* Live event feed */}
        {recentEvents.length > 0 && (
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
            <p className="text-[9px] uppercase tracking-widest text-slate-500 font-mono mb-2">Live Events</p>
            <div className="space-y-1">
              {recentEvents.slice(0, 5).map((ev, idx) => (
                <p
                  key={idx}
                  className={`text-[10px] font-mono truncate transition-opacity duration-300 ${
                    idx === 0 ? 'text-cyan-300 opacity-100' : 'text-slate-500 opacity-70'
                  }`}
                >
                  {ev}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // completed
  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <span className="text-xs font-semibold">Batch recovery pipeline executed successfully.</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="border border-slate-800 bg-slate-900/30 p-2 rounded-lg">
          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Recovered</span>
          <span className="font-bold text-emerald-400 tabular-nums">{liveMetrics.recovered}</span>
        </div>
        <div className="border border-slate-800 bg-slate-900/30 p-2 rounded-lg">
          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Still Failed</span>
          <span className="font-bold text-rose-400 tabular-nums">{liveMetrics.failed}</span>
        </div>
        <div className="border border-slate-800 bg-slate-900/30 p-2 rounded-lg">
          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Stopped</span>
          <span className="font-bold text-orange-400 tabular-nums">{liveMetrics.stopped}</span>
        </div>
        <div className="border border-slate-800 bg-slate-900/30 p-2 rounded-lg">
          <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Avg Recovery Rate</span>
          <span className="font-bold text-cyan-400 tabular-nums">
            {((metrics?.totalRecovered || 0) / (metrics?.totalAtRisk || 1) * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      <Link href="/transactions" className="w-full">
        <Button variant="outline" className="w-full border-slate-800 hover:bg-slate-800 flex items-center justify-center space-x-2">
          <span>Browse Audit Trails</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [allowReset, setAllowReset] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const [batchStatus, setBatchStatus] = useState<BatchStatusState>({
    id: null,
    status: 'idle',
    progress: 0,
    totalCount: 0,
    processedCount: 0,
    currentStage: 'idle',
    currentTxIndex: 0,
    liveMetrics: { recovered: 0, failed: 0, stopped: 0, pending: 0, nudgesBlocked: 0 },
    metrics: null,
    recentEvents: [],
  });

  // ── Fetch overview metrics ─────────────────────────────────────────────────
  const fetchOverviewMetrics = useCallback(async () => {
    try {
      const res = await fetch(`/api/overview?ts=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();
      if (data && !data.error) {
        const causeRecovery: { [key: string]: any } = {};
        (data.byFailureCause || []).forEach((item: any) => {
          causeRecovery[item.cause] = {
            atRisk: item.amountAtRisk,
            recovered: item.recoveredAmount,
            recoveryRate: item.recoveryRate,
            totalCount: item.count,
            recoveredCount: item.recoveredCount
          };
        });

        const metricsObj = data.metrics || data;

        return {
          totalTransactions: metricsObj.totalTransactions || 0,
          totalAtRisk: metricsObj.totalAtRisk || 0,
          totalRecovered: metricsObj.totalRecovered || 0,
          recoveryRate: metricsObj.recoveryRate || 0,
          recoveredCount: metricsObj.recoveredCount || 0,
          pendingCount: metricsObj.pendingCount || 0,
          stoppedCount: metricsObj.stoppedCount || 0,
          failedCount: metricsObj.failedCount || 0,
          causeRecovery,
          latestBatch: data.latestBatch || null,
          allowReset: data.allowReset || false,
        };
      }
    } catch {}
    return null;
  }, []);

  // ── Stop polling ────────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // ── Refresh all overview data ──────────────────────────────────────────────
  const refreshDashboard = useCallback(async () => {
    const overviewData = await fetchOverviewMetrics();
    if (!overviewData) return;

    const lb = overviewData.latestBatch;
    setAllowReset(overviewData.allowReset || false);
    
    let currentStatus: BatchStatusState['status'] = 'idle';
    let processed = 0;
    let total = overviewData.totalTransactions;
    let batchId = null;

    if (lb && lb.id) {
      batchId = lb.id;
      currentStatus = lb.status || 'idle';
      processed = lb.processed || 0;
      total = lb.total || overviewData.totalTransactions;
    } else if (overviewData.totalTransactions > 0 && overviewData.recoveredCount + overviewData.stoppedCount + overviewData.failedCount > 0) {
      currentStatus = 'completed';
      processed = overviewData.recoveredCount + overviewData.stoppedCount + overviewData.failedCount;
    }

    setBatchStatus(prev => ({
      ...prev,
      id: batchId,
      status: currentStatus,
      progress: total > 0 ? Math.round((processed / total) * 100) : 0,
      totalCount: total,
      processedCount: processed,
      liveMetrics: {
        recovered: overviewData.recoveredCount,
        failed: overviewData.failedCount,
        stopped: overviewData.stoppedCount,
        pending: overviewData.pendingCount,
        nudgesBlocked: overviewData.stoppedCount,
      },
      metrics: overviewData,
    }));
  }, [fetchOverviewMetrics]);

  // ── Poll /api/batch/{id}/live every 500ms ──────────────────────────────────
  const startPolling = useCallback((batchId: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/batch/${batchId}/live?ts=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === 'completed') {
          stopPolling();
          localStorage.removeItem('activeBatchId');
          // Final refresh to get full overview metrics
          const overviewData = await fetchOverviewMetrics();
          setBatchStatus(prev => ({
            ...prev,
            id: batchId,
            status: 'completed',
            processedCount: data.processedCount,
            totalCount: data.selectedCount,
            progress: data.progressPercent,
            currentStage: 'completed',
            recentEvents: data.recentEvents || [],
            liveMetrics: {
              recovered: data.recoveredCount ?? prev.liveMetrics.recovered,
              failed: data.failedCount ?? prev.liveMetrics.failed,
              stopped: data.stoppedCount ?? prev.liveMetrics.stopped,
              pending: data.pendingCount ?? prev.liveMetrics.pending,
              nudgesBlocked: data.blockedCount ?? prev.liveMetrics.nudgesBlocked,
            },
            metrics: overviewData || prev.metrics,
          }));
          const alreadyDismissed = sessionStorage.getItem(`dismissed_summary_${batchId}`);
          if (!alreadyDismissed) {
            setShowSummaryModal(true);
          }
        } else if (data.status === 'paused' || data.status === 'failed') {
          stopPolling();
          localStorage.removeItem('activeBatchId');
          await refreshDashboard();
        } else if (data.status === 'running' || data.status === 'queued') {
          const overviewData = await fetchOverviewMetrics();
          setBatchStatus(prev => ({
            ...prev,
            id: batchId,
            status: data.status,
            processedCount: data.processedCount,
            totalCount: data.selectedCount,
            progress: data.progressPercent,
            currentStage: data.currentStage || 'execute',
            currentTxIndex: data.processedCount,
            recentEvents: data.recentEvents || [],
            liveMetrics: {
              recovered: data.recoveredCount ?? prev.liveMetrics.recovered,
              failed: data.failedCount ?? prev.liveMetrics.failed,
              stopped: data.stoppedCount ?? prev.liveMetrics.stopped,
              pending: data.pendingCount ?? prev.liveMetrics.pending,
              nudgesBlocked: data.blockedCount ?? prev.liveMetrics.nudgesBlocked,
            },
            metrics: overviewData || prev.metrics,
          }));
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 500);
  }, [fetchOverviewMetrics, refreshDashboard, stopPolling]);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        // Restore active batch from localStorage first
        const storedBatchId = localStorage.getItem('activeBatchId');
        if (storedBatchId) {
          const liveRes = await fetch(`/api/batch/${storedBatchId}/live?ts=${Date.now()}`, { cache: 'no-store' });
          if (liveRes.ok) {
            const liveData = await liveRes.json();
            if (liveData.status === 'running' || liveData.status === 'queued') {
              await refreshDashboard();
              startPolling(storedBatchId);
              return;
            } else {
              localStorage.removeItem('activeBatchId');
            }
          } else {
            localStorage.removeItem('activeBatchId');
          }
        }
        // Fallback: check latest batch via overview
        await refreshDashboard();
      } catch (err) {
        console.error('Init error:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
    return () => stopPolling();
  }, [refreshDashboard, startPolling, stopPolling]);

  // ── Run batch ───────────────────────────────────────────────────────────────
  const runBatch = async () => {
    if (batchStatus.status === 'running') return;
    setBatchStatus(prev => ({
      ...prev,
      status: 'running',
      progress: 0,
      processedCount: 0,
      currentStage: 'starting',
      recentEvents: [],
      liveMetrics: { recovered: 0, failed: 0, stopped: 0, pending: prev.totalCount, nudgesBlocked: 0 },
    }));
    setShowSummaryModal(false);

    try {
      const res = await fetch('/api/batch/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'dashboard', transactionIds: 'all' }),
      });
      const data = await res.json();
      if (data.batchId) {
        localStorage.setItem('activeBatchId', data.batchId);
        setBatchStatus(prev => ({ ...prev, id: data.batchId, status: data.status }));
        startPolling(data.batchId);
      } else {
        console.error('Batch start failed:', data.error);
        await refreshDashboard();
      }
    } catch (error) {
      console.error('Error running batch:', error);
      await refreshDashboard();
    }
  };

  const resumeCurrentBatch = async () => {
    if (!batchStatus.id) return;
    try {
      const res = await fetch(`/api/batch/${batchStatus.id}/resume`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const resumedId = batchStatus.id;
        localStorage.setItem('activeBatchId', resumedId);
        setBatchStatus(prev => ({ ...prev, status: 'running' }));
        startPolling(resumedId);
      }
    } catch (e) {
      console.error('Resume error:', e);
    }
  };

  const handleResetDataset = async () => {
    setIsResetting(true);
    try {
      const res = await fetch('/api/dataset/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionCount: 300, preserveSettings: true }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset dataset');
      }
      
      // Clear client state
      stopPolling();
      setBatchStatus(prev => ({
        ...prev,
        id: null,
        status: 'idle',
        progress: 0,
        processedCount: 0,
        currentStage: 'idle',
        currentTxIndex: 0,
        liveMetrics: { recovered: 0, failed: 0, stopped: 0, pending: 0, nudgesBlocked: 0 },
      }));
      
      setShowResetDialog(false);
      await refreshDashboard();
    } catch (err: any) {
      console.error(err);
      alert('Reset failed: ' + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  const { status, progress, totalCount, processedCount, currentStage, recentEvents, liveMetrics, metrics } = batchStatus;

  // Chart data grouped by canonical failure cause names
  // Chart data grouped by canonical failure cause names
  const chartData = useMemo(() => {
    const defaultCategories: { [displayName: string]: { atRisk: number; recovered: number; count: number } } = {
      'Low Balance': { atRisk: 0, recovered: 0, count: 0 },
      'Bank Offline': { atRisk: 0, recovered: 0, count: 0 },
      'Limit Hit': { atRisk: 0, recovered: 0, count: 0 },
      'Expired': { atRisk: 0, recovered: 0, count: 0 },
      'Ambiguous': { atRisk: 0, recovered: 0, count: 0 },
    };

    const names: { [key: string]: string } = {
      insufficient_balance: 'Low Balance',
      low_balance: 'Low Balance',
      bank_downtime: 'Bank Offline',
      bank_offline: 'Bank Offline',
      bank_server_down: 'Bank Offline',
      mandate_expired: 'Expired',
      expired_mandate: 'Expired',
      expired: 'Expired',
      limit_exceeded: 'Limit Hit',
      limit_hit: 'Limit Hit',
      wrong_debit_date: 'Ambiguous',
      unclassified: 'Ambiguous',
      unknown: 'Ambiguous',
    };

    if (metrics?.causeRecovery) {
      for (const key of Object.keys(metrics.causeRecovery)) {
        const item = metrics.causeRecovery[key];
        const displayName = names[key] || key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        if (!defaultCategories[displayName]) {
          defaultCategories[displayName] = { atRisk: 0, recovered: 0, count: 0 };
        }
        defaultCategories[displayName].atRisk += item.atRisk || 0;
        defaultCategories[displayName].recovered += item.recovered || 0;
        defaultCategories[displayName].count += item.totalCount || item.count || 0;
      }
    }

    return Object.entries(defaultCategories).map(([name, data]) => ({
      name,
      atRisk: data.atRisk,
      recovered: data.recovered,
      rate: data.atRisk > 0 ? (data.recovered / data.atRisk) * 100 : 0,
      count: data.count,
    }));
  }, [metrics, metrics?.causeRecovery]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-96 md:col-span-2 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  const buttonLabel = 
    status === 'running' ? `Batch Running — ${processedCount} / ${totalCount}` :
    status === 'paused' ? `Batch Paused — ${processedCount} / ${totalCount}` :
    status === 'completed' ? `Run Completed — ${processedCount} / ${totalCount}` :
    'Run Batch Engine';

  return (
    <>
      {/* Summary modal */}
      {showSummaryModal && (
        <SummaryModal
          metrics={metrics}
          liveMetrics={liveMetrics}
          onClose={() => {
            if (batchStatus.id) {
              sessionStorage.setItem(`dismissed_summary_${batchStatus.id}`, 'true');
            }
            setShowSummaryModal(false);
          }}
        />
      )}

      {/* Reset confirmation dialog */}
      {showResetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={() => !isResetting && setShowResetDialog(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-rose-950/40 backdrop-blur-xl animate-fade-in overflow-hidden ring-1 ring-white/10">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-800/80 bg-zinc-900/50">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-md shadow-rose-500/10">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white font-display tracking-tight">Reset & Generate Fresh Data</h2>
                  <p className="text-xs text-zinc-400 font-mono">Sandbox dataset management</p>
                </div>
              </div>
              <button
                onClick={() => !isResetting && setShowResetDialog(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                disabled={isResetting}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5">
              <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                This action will wipe the current transaction database, create a timestamped JSON backup, and generate <strong className="text-white font-mono font-bold">300 fresh synthetic failure records</strong>. Any active recovery batches will be safely halted.
              </p>
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3.5 flex items-start space-x-3">
                <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-300 font-medium leading-normal">
                  <strong className="font-bold">Warning:</strong> All ledger entries and active pipeline history will be reset. Are you sure you want to proceed?
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 justify-end pt-1">
                <button
                  disabled={isResetting}
                  onClick={() => setShowResetDialog(false)}
                  className="py-2.5 px-4 rounded-xl border border-zinc-700 bg-zinc-900 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  disabled={isResetting}
                  onClick={handleResetDataset}
                  className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 text-sm font-bold text-white shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 transition-all flex items-center space-x-2"
                >
                  {isResetting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span>{isResetting ? 'Resetting...' : 'Confirm Reset'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-8 animate-fade-in">
        {/* Warning Callouts */}
        {totalCount > 0 && status === 'idle' && (metrics?.totalRecovered === 0) && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4 flex items-center justify-between text-sky-300">
            <div className="flex items-center space-x-3">
              <Activity className="h-5 w-5 text-sky-400 shrink-0" />
              <span className="text-sm font-medium">
                {totalCount} failed mandates loaded. Recovery engine has not run yet.
              </span>
            </div>
            <Button variant="signal" size="sm" onClick={runBatch}>
              Run Batch Engine
            </Button>
          </div>
        )}

        {totalCount > 0 && metrics?.totalAtRisk === 0 && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 flex items-center space-x-3 text-rose-300">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0" />
            <span className="text-sm font-medium">
              Metric data mismatch: transactions exist but at-risk total is zero.
            </span>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold tracking-normal text-slate-100 font-sans">
              Auto-Recovery Control Center
            </h1>
            <p className="mt-0.5 text-xs text-slate-400 font-normal max-w-2xl">
              Monitor active recovery pipelines, compliance guardrails, and money recovered from failed subscription mandates.
            </p>
          </div>

          {/* Run / Status button & Reconciliation Badge */}
          <div className="flex items-center gap-3">
            {/* Reconciliation Badge */}
            {metrics && (
              <Badge
                variant={metrics.ledgerBalanced !== false ? 'emerald' : 'rose'}
                className="font-mono text-xs px-2.5 py-1 flex items-center space-x-1"
              >
                {metrics.ledgerBalanced !== false ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Ledger balanced ✓</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Ledger reconciliation required</span>
                  </>
                )}
              </Badge>
            )}

            <button
              onClick={refreshDashboard}
              className="text-xs text-slate-400 border border-slate-800 rounded-lg px-3 py-2 hover:bg-slate-800 transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            
            {allowReset && (
              <button
                onClick={() => setShowResetDialog(true)}
                className="text-xs text-rose-400 border border-rose-500/30 rounded-lg px-3 py-2 hover:bg-rose-500/10 transition-colors flex items-center gap-1.5"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Reset Demo Data
              </button>
            )}
            {status === 'completed' && (
              <button
                onClick={() => setShowSummaryModal(true)}
                className="text-xs text-cyan-400 border border-cyan-500/30 rounded-lg px-3 py-2 hover:bg-cyan-500/10 transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                View Summary
              </button>
            )}
            {status === 'running' ? (
              <Button variant="outline" disabled className="border-slate-800 text-slate-400 bg-slate-900/50">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-cyan-400" />
                {buttonLabel}
              </Button>
            ) : status === 'paused' ? (
              <Button variant="outline" onClick={resumeCurrentBatch} className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10">
                <Play className="mr-2 h-4 w-4" />
                Resume ({processedCount}/{totalCount})
              </Button>
            ) : (metrics?.pendingCount || 0) > 0 ? (
              <Button
                variant="signal"
                size="lg"
                onClick={runBatch}
                className="h-10 hover:shadow-cyan-500/10 hover:scale-[1.01]"
              >
                <Play className="mr-2 h-4.5 w-4.5 fill-current" />
                Process Eligible Cases ({metrics?.pendingCount || 0})
              </Button>
            ) : (
              <Button
                variant="outline"
                size="lg"
                disabled
                className="h-10 border-slate-800 text-slate-500 bg-slate-900/50 cursor-not-allowed"
              >
                <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />
                No Eligible Cases
              </Button>
            )}
          </div>
        </div>

        {/* Live progress banner — shown only while running */}
        {status === 'running' && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500" />
                </span>
                <span className="text-sm font-semibold text-cyan-300 font-mono">
                  Processing <strong>{processedCount}</strong> / {totalCount}
                  {currentStage !== 'idle' && (
                    <span className={`ml-2 ${STAGE_COLORS[currentStage]}`}>
                      — Stage: {STAGE_LABELS[currentStage]}
                    </span>
                  )}
                </span>
              </div>
              <span className="text-sm font-bold font-mono text-white">{progress}%</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {/* Stage pipeline bar */}
            <div className="flex items-center gap-1 text-[10px] font-mono">
              {(['classify', 'decide', 'guardrails', 'execute'] as const).map((stage, idx) => {
                const stageOrder = ['classify', 'decide', 'guardrails', 'execute'];
                const currentIdx = stageOrder.indexOf(currentStage);
                const isActive = currentStage === stage;
                const isDone = currentIdx > idx;
                return (
                  <React.Fragment key={stage}>
                    <span className={`px-2 py-0.5 rounded transition-all duration-300 ${
                      isActive 
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold' 
                        : isDone
                          ? 'text-emerald-400/50'
                          : 'text-slate-600'
                    }`}>
                      {isDone ? '✓ ' : ''}{STAGE_LABELS[stage]}
                    </span>
                    {idx < 3 && <span className="text-slate-700">→</span>}
                  </React.Fragment>
                );
              })}
            </div>
            {/* Live counters in banner */}
            <div className="flex gap-4 text-xs font-mono pt-1">
              <span className="text-emerald-400">↑ {liveMetrics.recovered} recovered</span>
              <span className="text-rose-400">✗ {liveMetrics.failed} failed</span>
              <span className="text-orange-400">⊘ {liveMetrics.stopped} stopped</span>
              <span className="text-amber-400">🛡 {liveMetrics.nudgesBlocked} blocked</span>
            </div>
          </div>
        )}

        {/* KPI Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-zinc-700 bg-black">
            <CardHeader className="p-3.5 pb-1.5">
              <CardDescription className="text-[10px] uppercase tracking-wider font-bold font-display text-slate-400">
                Total Volume At Risk
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3.5 pt-0">
              <div className="text-xl font-extrabold tracking-tight text-white tabular-nums">
                {formatCurrency(metrics?.totalAtRisk || 0)}
              </div>
              <p className="text-[9px] text-slate-400 mt-0.5 font-mono uppercase tracking-wider">
                {totalCount} Failed Mandates Loaded
              </p>
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
            <CardHeader className="p-3.5 pb-1.5">
              <CardDescription className="text-[10px] uppercase tracking-wider font-bold font-display text-emerald-400">
                Recovered Revenue
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3.5 pt-0">
              <div className="text-xl font-extrabold tracking-tight text-emerald-400 tabular-nums">
                {formatCurrency(metrics?.totalRecovered || 0)}
              </div>
              <p className="text-[9px] text-emerald-500/70 mt-0.5 font-mono uppercase tracking-wider flex items-center">
                <TrendingUp className="h-3 w-3 mr-1" />
                {status === 'running' ? `${liveMetrics.recovered} so far` : `${metrics?.recoveredCount || 0} Mandates Saved`}
              </p>
            </CardContent>
          </Card>

          <Card className="border-cyan-500/20 bg-cyan-500/[0.02]">
            <CardHeader className="p-3.5 pb-1.5">
              <CardDescription className="text-[10px] uppercase tracking-wider font-bold font-display text-cyan-400">
                Overall Recovery Rate
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3.5 pt-0">
              <div className="text-xl font-extrabold tracking-tight text-cyan-400 tabular-nums">
                {(metrics?.recoveryRate || 0).toFixed(1)}%
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1.5">
                <div
                  className="bg-gradient-to-r from-blue-500 to-cyan-400 h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${metrics?.recoveryRate || 0}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-amber-500/20 bg-amber-500/[0.01]">
            <CardHeader className="p-3.5 pb-1.5 flex-row justify-between items-center space-y-0">
              <CardDescription className="text-[10px] uppercase tracking-wider font-bold font-display text-amber-500">
                False-Positive Cost
              </CardDescription>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            </CardHeader>
            <CardContent className="p-3.5 pt-0">
              <div className="text-xl font-extrabold tracking-tight text-amber-400 tabular-nums">
                {status === 'running' ? liveMetrics.nudgesBlocked : (metrics?.stoppedCount || 0)}
              </div>
              <p className="text-[9px] text-slate-400 mt-0.5 font-medium">
                {status === 'running' ? 'Nudges blocked by guardrails' : 'Interventions stopped to protect UX'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Bar Chart */}
          <Card className="lg:col-span-2 border-zinc-700 bg-black flex flex-col">
            <CardHeader className="p-5 pb-1">
              <CardTitle className="flex items-center space-x-2 text-base font-bold font-display text-white">
                <TrendingUp className="h-5 w-5 text-cyan-400" />
                <span>Recovery Rate by Failure Cause</span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Breakdown of recovery success rates mapped across distinct transaction failure causes.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 pt-1 flex-1 min-h-[260px] flex flex-col justify-end">
              {(status === 'idle' && chartData.length === 0) ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 border border-dashed border-slate-800 rounded-lg py-8">
                  <Activity className="h-8 w-8 text-slate-700 animate-pulse" />
                  <span className="text-xs font-medium">
                    No recovery data available. Run batch to populate chart.
                  </span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.5} />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} domain={[0, 100]} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(30, 41, 59, 0.3)' }} />
                    <Bar dataKey="rate" radius={[5, 5, 0, 0]} barSize={44} minPointSize={4}>
                      {chartData.map((entry, index) => {
                        let color = '#0ea5e9';
                        if (entry.name === 'Low Balance') color = '#10b981';
                        if (entry.name === 'Bank Offline') color = '#8b5cf6';
                        if (entry.name === 'Expired') color = '#ef4444';
                        if (entry.name === 'Limit Hit') color = '#f59e0b';
                        return <Cell key={`cell-${index}`} fill={color} fillOpacity={0.85} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Engine Status */}
          <Card className="border-zinc-700 bg-black flex flex-col justify-between">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-white">
                <Sparkles className="h-5 w-5 text-cyan-400" />
                <span>Recovery Engine Status</span>
              </CardTitle>
              <CardDescription>
                Real-time batch execution pipeline logs and audit trails.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col justify-center">
              <PipelineStatusBlock
                status={status}
                processedCount={processedCount}
                totalCount={totalCount}
                currentStage={currentStage}
                liveMetrics={liveMetrics}
                metrics={metrics}
                recentEvents={recentEvents}
                onRun={runBatch}
                onResume={resumeCurrentBatch}
              />
            </CardContent>
          </Card>
        </div>

        {/* Compliance banner */}
        <Card className="border-zinc-700 bg-black p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <ShieldAlert className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Compliant Escalation Layer Active</h4>
                <p className="text-xs text-slate-400">
                  All scheduled nudges evaluate frequency limits and local time restriction filters (9 AM - 8 PM IST) before execution.
                </p>
              </div>
            </div>
            <Link href="/guardrails">
              <Button variant="outline" size="sm" className="border-slate-800 hover:bg-slate-800 whitespace-nowrap text-xs">
                View Guardrail Logs
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
