'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '@/components/ui';
import { Shield, Loader2, AlertOctagon, CheckCircle2, RefreshCw } from 'lucide-react';

export default function GuardrailsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; targetKillSwitch: boolean } | null>(null);

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
  const isKillSwitchActive = typeof data?.dispatchKillSwitch === 'boolean'
    ? data.dispatchKillSwitch
    : (summary.killSwitchActive ?? true);

  const handleToggleClick = () => {
    const targetState = !isKillSwitchActive;
    setConfirmDialog({ open: true, targetKillSwitch: targetState });
  };

  const confirmToggleKillSwitch = async () => {
    if (!confirmDialog) return;
    const nextState = confirmDialog.targetKillSwitch;
    setConfirmDialog(null);
    setToggling(true);

    try {
      const res = await fetch('/api/settings/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dispatchKillSwitch: nextState }),
      });
      const json = await res.json();
      if (json.dispatchKillSwitch !== undefined) {
        await fetchGuardrails();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Confirmation Modal */}
      {confirmDialog?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0b1329] border border-slate-700 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-fade-in">
            <h3 className="text-lg font-bold text-white font-display">
              {confirmDialog.targetKillSwitch ? 'Pause Recovery Dispatch?' : 'Enable Recovery Dispatch?'}
            </h3>
            <p className="text-sm text-slate-300">
              {confirmDialog.targetKillSwitch
                ? 'Pause simulated recovery dispatch? The active batch will stop before its next transaction.'
                : 'Enable simulated recovery dispatch? This allows eligible sandbox recovery actions when a batch is explicitly resumed or started.'}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setConfirmDialog(null)}
                className="border-slate-700 text-slate-300"
              >
                Cancel
              </Button>
              <Button
                variant={confirmDialog.targetKillSwitch ? 'outline' : 'signal'}
                className={confirmDialog.targetKillSwitch ? 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10' : ''}
                onClick={confirmToggleKillSwitch}
              >
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}

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
      <Card className={`border-2 transition-all duration-300 ${isKillSwitchActive ? 'border-rose-500/30 bg-rose-950/10' : 'border-emerald-500/20 bg-emerald-950/5'}`}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-white">Global Dispatch Kill-Switch</CardTitle>
              <CardDescription>Instantly pause all recovery retries, nudges, and customer touchpoints.</CardDescription>
            </div>
            <Badge variant={isKillSwitchActive ? 'rose' : 'emerald'} className="font-bold tracking-wider py-1 px-3">
              {isKillSwitchActive ? 'PAUSED / LOCKED' : 'DISPATCH ENABLED'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex justify-between items-center pt-2">
          <p className="text-sm text-slate-400 max-w-xl">
            When enabled, the kill-switch overrides the pipeline executor layer. Any running batches will immediately cease all communications to protect client user experience.
          </p>
          <Button
            variant={isKillSwitchActive ? 'signal' : 'outline'}
            onClick={handleToggleClick}
            disabled={toggling}
            className={!isKillSwitchActive ? 'border-rose-500/40 text-rose-400 hover:bg-rose-500/10' : ''}
          >
            {toggling ? <Loader2 className="animate-spin h-4 w-4" /> : isKillSwitchActive ? 'Enable Dispatch' : 'Pause Dispatch'}
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
            <div className="text-center p-8 text-slate-500">No guardrails incidents recorded. All executions are fully compliant.</div>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {events.map((ev: any, idx: number) => {
                const isPassed = ev.passed ?? ev.allowed ?? false;
                const checkName = ev.check_name || ev.rule || 'check';
                const detailText = ev.detail || ev.reason || 'Guardrail check';
                const timestampText = ev.created_at || ev.timestamp || new Date().toISOString();
                return (
                  <div key={idx} className="flex justify-between items-start border-b border-slate-850 pb-3 text-sm">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs font-bold text-white">{ev.transaction_id || 'SYSTEM'}</span>
                        <Badge variant={isPassed ? 'emerald' : 'rose'} className="font-mono text-[9px] uppercase">
                          {checkName}: {isPassed ? 'PASSED' : 'BLOCKED'}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 font-mono mt-1">{detailText}</p>
                    </div>
                    <span className="text-xs text-slate-500 font-mono">{new Date(timestampText).toLocaleTimeString()}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
