'use client';

import React, { useState, useEffect } from 'react';
import { 
  Play, 
  RotateCcw, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  ShieldAlert, 
  ArrowRight, 
  Loader2, 
  Sparkles,
  TrendingUp,
  Activity
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
  Cell 
} from 'recharts';
import Link from 'next/link';

// Custom tooltip for chart
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-lg border border-slate-800 bg-[#131B2E] p-3 shadow-md">
        <p className="text-xs font-semibold text-slate-300 font-display uppercase tracking-wider">{data.name}</p>
        <div className="mt-2 space-y-1 text-sm font-mono text-slate-100">
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

interface BatchStatusState {
  status: 'idle' | 'running' | 'completed';
  progress: number;
  totalCount: number;
  processedCount: number;
  metrics: any;
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [batchStatus, setBatchStatus] = useState<BatchStatusState>({
    status: 'idle',
    progress: 0,
    totalCount: 0,
    processedCount: 0,
    metrics: null
  });

  const fetchStatus = async () => {
    try {
      const overviewRes = await fetch('/api/overview');
      const overviewData = await overviewRes.json();

      const batchRes = await fetch('/api/batch/run');
      const batchData = await batchRes.json();

      if (overviewData && !overviewData.error) {
        const causeRecovery: { [key: string]: any } = {};
        if (overviewData.byFailureCause) {
          overviewData.byFailureCause.forEach((item: any) => {
            causeRecovery[item.cause] = {
              atRisk: item.amountAtRisk,
              recovered: item.recoveredAmount,
              recoveryRate: item.recoveryRate,
              totalCount: item.count,
              recoveredCount: item.recoveredCount
            };
          });
        }

        const metrics = {
          totalAtRisk: overviewData.totalAtRisk,
          totalRecovered: overviewData.totalRecovered,
          recoveryRate: overviewData.recoveryRate,
          recoveredCount: overviewData.recoveredCount,
          pendingCount: overviewData.pendingCount,
          stoppedCount: overviewData.stoppedCount,
          failedCount: overviewData.failedCount,
          falsePositiveCostCount: 0,
          falsePositiveCostAmount: 0,
          causeRecovery
        };

        setBatchStatus({
          status: overviewData.totalExecuted > 0 ? 'completed' : batchData.status || 'idle',
          progress: batchData.progress || 100,
          totalCount: overviewData.totalTransactions,
          processedCount: overviewData.totalExecuted,
          metrics
        });
      }
    } catch (error) {
      console.error('Error fetching overview status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    
    let intervalId: NodeJS.Timeout;
    if (batchStatus.status === 'running') {
      intervalId = setInterval(() => {
        fetchStatus();
      }, 1000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [batchStatus.status]);

  const runBatch = async () => {
    setBatchStatus((prev) => ({ ...prev, status: 'running', progress: 0 }));
    try {
      const res = await fetch('/api/batch/run', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setBatchStatus((prev) => ({
          ...prev,
          status: 'running',
          progress: 0
        }));
      }
    } catch (error) {
      console.error('Error running batch:', error);
      fetchStatus();
    }
  };

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

  const { status, progress, totalCount, processedCount, metrics } = batchStatus;
  
  // Format Indian Rupees
  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amt);
  };

  // Prepare chart data
  const chartData = metrics?.causeRecovery ? Object.keys(metrics.causeRecovery).map(key => {
    const item = metrics.causeRecovery[key];
    // Map internal cause to friendly display
    const names: { [key: string]: string } = {
      insufficient_balance: 'Low Balance',
      bank_downtime: 'Bank Offline',
      mandate_expired: 'Expired',
      limit_exceeded: 'Limit Hit',
      unknown: 'Ambiguous'
    };
    return {
      name: names[key] || key,
      atRisk: item.atRisk,
      recovered: item.recovered,
      rate: item.recoveryRate,
      count: item.totalCount
    };
  }) : [];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Auto-Recovery Control Center
          </h1>
          <p className="mt-1.5 text-slate-400 font-medium max-w-2xl">
            Monitor active recovery pipelines, compliance guardrails, and money recovered from failed subscription mandates.
          </p>
        </div>
        
        {/* Quick Batch CTA */}
        <div>
          {status === 'running' ? (
            <Button variant="outline" disabled className="border-slate-800 text-slate-400 bg-slate-900/50">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-cyan-400" />
              Processing ({progress}%)
            </Button>
          ) : (
            <Button 
              variant="signal" 
              size="lg" 
              onClick={runBatch}
              className="h-10 hover:shadow-cyan-500/10 hover:scale-[1.01]"
            >
              <Play className="mr-2 h-4.5 w-4.5 fill-current" />
              {status === 'completed' ? 'Re-run Batch Engine' : 'Run Recovery Batch'}
            </Button>
          )}
        </div>
      </div>

      {/* KPI Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* KPI 1: At Risk */}
        <Card className="border-zinc-700 bg-black">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-bold font-display text-slate-400">
              Total Volume At Risk
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-extrabold tracking-tight text-white tabular-nums">
              {formatCurrency(metrics?.totalAtRisk || 0)}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-mono uppercase tracking-wider">
              {totalCount} Failed Mandates Loaded
            </p>
          </CardContent>
        </Card>

        {/* KPI 2: Recovered */}
        <Card className="border-emerald-500/20 bg-emerald-500/[0.02]">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-bold font-display text-emerald-400">
              Recovered Revenue
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-extrabold tracking-tight text-emerald-400 tabular-nums">
              {formatCurrency(metrics?.totalRecovered || 0)}
            </div>
            <p className="text-[10px] text-emerald-500/70 mt-1 font-mono uppercase tracking-wider flex items-center">
              <TrendingUp className="h-3 w-3 mr-1" />
              {metrics?.recoveredCount || 0} Mandates Saved
            </p>
          </CardContent>
        </Card>

        {/* KPI 3: Recovery Rate */}
        <Card className="border-cyan-500/20 bg-cyan-500/[0.02]">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs uppercase tracking-wider font-bold font-display text-cyan-400">
              Overall Recovery Rate
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-extrabold tracking-tight text-cyan-400 tabular-nums">
              {(metrics?.recoveryRate || 0).toFixed(1)}%
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2">
              <div 
                className="bg-gradient-to-r from-blue-500 to-cyan-400 h-1.5 rounded-full transition-all duration-500" 
                style={{ width: `${metrics?.recoveryRate || 0}%` }}
              />
            </div>
          </CardContent>
        </Card>

        {/* KPI 4: False Positive Cost Callout */}
        <Card className="border-amber-500/20 bg-amber-500/[0.01]">
          <CardHeader className="p-4 pb-2 flex-row justify-between items-center space-y-0">
            <CardDescription className="text-xs uppercase tracking-wider font-bold font-display text-amber-500">
              False-Positive Cost
            </CardDescription>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-extrabold tracking-tight text-amber-400 tabular-nums">
              {metrics?.falsePositiveCostCount || 0}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 font-medium">
              Nudges sent to customers who never paid
            </p>
            <p className="text-[9px] text-slate-500 font-mono mt-0.5">
              Annoyance Exposure: {formatCurrency(metrics?.falsePositiveCostAmount || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Bar Chart */}
        <Card className="lg:col-span-2 border-zinc-700 bg-black flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-cyan-400" />
              <span>Recovery Rate by Failure Cause</span>
            </CardTitle>
            <CardDescription>
              Breakdown of recovery success rates mapped across distinct transaction failure causes.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="pt-0 h-72">
            {status === 'idle' ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 border border-dashed border-slate-800 rounded-lg">
                <Activity className="h-8 w-8 text-slate-700 animate-pulse" />
                <span className="text-sm font-medium">No recovery data available. Run batch to populate chart.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis 
                    dataKey="name" 
                    stroke="#94a3b8" 
                    fontSize={11} 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <YAxis 
                    stroke="#94a3b8" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(val) => `${val}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(30, 41, 59, 0.3)' }} />
                  <Bar dataKey="rate" radius={[4, 4, 0, 0]} barSize={40}>
                    {chartData.map((entry, index) => {
                      // Semantic gradients for causes
                      let color = '#0ea5e9'; // primary blue
                      if (entry.name === 'Low Balance') color = '#10b981'; // emerald
                      if (entry.name === 'Bank Offline') color = '#8b5cf6'; // violet
                      if (entry.name === 'Expired') color = '#ef4444'; // rose
                      if (entry.name === 'Limit Hit') color = '#f59e0b'; // amber
                      return <Cell key={`cell-${index}`} fill={color} fillOpacity={0.8} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Engine status block */}
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
            {status === 'idle' && (
              <div className="space-y-4 text-center py-6">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 border border-slate-800">
                  <Play className="h-5 w-5 text-slate-400" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-white">Pipeline Idle</h4>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto">
                    300 failed Autopay mandates have been initialized. Trigger the engine to run recovery checks.
                  </p>
                </div>
                <Button variant="outline" className="w-full border-slate-800 hover:bg-slate-800" onClick={runBatch}>
                  Execute Recovery Batch
                </Button>
              </div>
            )}

            {status === 'running' && (
              <div className="space-y-6 py-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wider font-mono text-cyan-400 flex items-center">
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    RUNNING PIPELINE STAGES
                  </span>
                  <span className="text-xs font-mono font-bold text-white">{processedCount}/{totalCount} Processed</span>
                </div>
                
                <div className="space-y-2">
                  <Progress value={progress} />
                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span>0% (Classifying)</span>
                    <span>100% (Completed)</span>
                  </div>
                </div>

                <div className="border border-slate-800/80 bg-slate-900/40 rounded-lg p-3 space-y-2 font-mono text-[10px] text-slate-400 max-h-36 overflow-y-auto">
                  <p className="text-violet-400 flex items-center">
                    <span className="animate-pulse h-1.5 w-1.5 rounded-full bg-violet-400 mr-2" />
                    [CLASSIFY] Running Claude API tie-breaks...
                  </p>
                  <p className="text-slate-500">
                    [DECIDE] Deterministic mappings evaluating...
                  </p>
                  <p className="text-slate-500">
                    [GUARDRAILS] Quiethours & retry_caps checking...
                  </p>
                  <p className="text-slate-500">
                    [EXECUTE] Probabilistic sandbox outcomes saving...
                  </p>
                </div>
              </div>
            )}

            {status === 'completed' && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <span className="text-xs font-semibold">Batch recovery pipeline executed successfully.</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="border border-slate-800 bg-slate-900/30 p-2 rounded-lg">
                    <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Recovered</span>
                    <span className="font-bold text-emerald-400 tabular-nums">{metrics?.recoveredCount || 0}</span>
                  </div>
                  <div className="border border-slate-800 bg-slate-900/30 p-2 rounded-lg">
                    <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Still Failed</span>
                    <span className="font-bold text-rose-400 tabular-nums">{metrics?.failedCount || 0}</span>
                  </div>
                  <div className="border border-slate-800 bg-slate-900/30 p-2 rounded-lg">
                    <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Stopped</span>
                    <span className="font-bold text-rose-400/70 tabular-nums">{metrics?.stoppedCount || 0}</span>
                  </div>
                  <div className="border border-slate-800 bg-slate-900/30 p-2 rounded-lg">
                    <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Avg Recovery Rate</span>
                    <span className="font-bold text-cyan-400 tabular-nums">{((metrics?.totalRecovered || 0) / (metrics?.totalAtRisk || 1) * 100).toFixed(1)}%</span>
                  </div>
                </div>

                <Link href="/transactions" className="w-full">
                  <Button variant="outline" className="w-full border-slate-800 hover:bg-slate-800 flex items-center justify-center space-x-2">
                    <span>Browse Audit Trails</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )}
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
  );
}
