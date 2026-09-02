'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '@/components/ui';
import { Shield, Loader2, AlertOctagon, CheckCircle2, RefreshCw } from 'lucide-react';

export default function GuardrailsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchGuardrails = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/guardrails');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuardrails();
  }, []);

  const summary = data?.summary || {};
  const events = data?.events || [];

  const handleToggleKillSwitch = async () => {
    setToggling(true);
    try {
      const res = await fetch('/api/guardrails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: !summary.killSwitchActive }),
      });
      const json = await res.json();
      if (json.success) {
        fetchGuardrails();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-white tracking-tight">Bounded Executor / Guardrails</h1>
          <p className="text-slate-400 mt-2">Manage compliance limits and outgoing pipeline controls.</p>
        </div>
        <Button onClick={fetchGuardrails} disabled={loading} variant="outline" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Kill switch card */}
      <Card className={`border-2 transition-all duration-300 ${summary.killSwitchActive ? 'border-rose-500/30 bg-rose-950/10' : 'border-emerald-500/20 bg-emerald-950/5'}`}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-white">Global Dispatch Kill-Switch</CardTitle>
              <CardDescription>Instantly pause all recovery retries, nudges, and customer touchpoints.</CardDescription>
            </div>
            <Badge variant={summary.killSwitchActive ? 'rose' : 'emerald'} className="font-bold tracking-wider py-1 px-3">
              {summary.killSwitchActive ? 'PAUSED / LOCKED' : 'DISPATCH ACTIVE'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex justify-between items-center pt-2">
          <p className="text-sm text-slate-400 max-w-xl">
            When enabled, the kill-switch overrides the pipeline executor layer. Any running batches will immediately cease all communications to protect client user experience.
          </p>
          <Button variant="signal" onClick={handleToggleKillSwitch} disabled={toggling}>
            {toggling ? <Loader2 className="animate-spin h-4 w-4" /> : summary.killSwitchActive ? 'Enable Dispatch' : 'TRIGGER HALT'}
          </Button>
        </CardContent>
      </Card>

      {/* Grid of metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border border-slate-800 bg-slate-950/40 p-6 space-y-2">
          <p className="text-xs text-slate-500 font-mono font-bold uppercase">Retry Cap Hits</p>
          <div className="flex justify-between items-baseline pt-2">
            <span className="text-3xl font-extrabold font-mono text-white tabular-nums">{summary.retryCapBlocked || 0}</span>
            <span className="text-xs text-slate-400 font-mono">Limit: 3 / mandate</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-sky-500 h-full rounded-full" style={{ width: `${Math.min(100, ((summary.retryCapBlocked || 0) / 10) * 100)}%` }}></div>
          </div>
        </Card>

        <Card className="border border-slate-800 bg-slate-950/40 p-6 space-y-2">
          <p className="text-xs text-slate-500 font-mono font-bold uppercase">Nudge Cap Hits</p>
          <div className="flex justify-between items-baseline pt-2">
            <span className="text-3xl font-extrabold font-mono text-white tabular-nums">{summary.nudgeCapBlocked || 0}</span>
            <span className="text-xs text-slate-400 font-mono">Limit: 2 / customer / wk</span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-violet-500 h-full rounded-full" style={{ width: `${Math.min(100, ((summary.nudgeCapBlocked || 0) / 10) * 100)}%` }}></div>
          </div>
        </Card>

        <Card className="border border-slate-800 bg-slate-950/40 p-6 space-y-2">
          <p className="text-xs text-slate-500 font-mono font-bold uppercase">Quiet-Hours Blocks</p>
          <div className="flex justify-between items-baseline pt-2">
            <span className="text-3xl font-extrabold font-mono text-amber-500 tabular-nums">{summary.quietHoursBlocked || 0}</span>
            <span className="text-xs text-slate-400 font-mono">IST 8 PM - 9 AM</span>
          </div>
          <div className="flex items-center space-x-1 text-xs text-amber-400 mt-2 font-mono">
            <AlertOctagon className="h-3.5 w-3.5" />
            <span>Honored Quiet Hours</span>
          </div>
        </Card>

        <Card className="border border-slate-800 bg-slate-950/40 p-6 space-y-2">
          <p className="text-xs text-slate-500 font-mono font-bold uppercase">Opt-outs Honored</p>
          <div className="flex justify-between items-baseline pt-2">
            <span className="text-3xl font-extrabold font-mono text-emerald-400 tabular-nums">{summary.optOutBlocked || 0}</span>
            <span className="text-xs text-slate-400 font-mono">Hard check</span>
          </div>
          <div className="flex items-center space-x-1 text-xs text-emerald-400 mt-2 font-mono">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Opt-out gate clear</span>
          </div>
        </Card>
      </div>

      {/* Events feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5 text-sky-400" />
            <span>Live Guardrails Log Feed ({events.length})</span>
          </CardTitle>
          <CardDescription>Real-time telemetry showing compliance and block checks firing.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center p-8 text-slate-500">No guardrails incidents triggered. All executions are fully compliant.</div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {events.map((ev: any, idx: number) => (
                <div key={idx} className="flex justify-between items-start border-b border-slate-850 pb-3 text-sm">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-white">{ev.transaction_id}</span>
                      <Badge variant={ev.allowed ? 'emerald' : 'rose'} className="font-mono text-[9px] uppercase">
                        {ev.rule}: {ev.allowed ? 'PASSED' : 'BLOCKED'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-400 font-mono mt-1">{ev.reason}</p>
                  </div>
                  <span className="text-xs text-slate-500 font-mono">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
