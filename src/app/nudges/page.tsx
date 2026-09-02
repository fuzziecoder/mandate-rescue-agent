'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '@/components/ui';
import { Loader2, Copy, FileText, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function NudgesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/nudges')
      .then((res) => res.json())
      .then((json) => {
        setData(json);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const templates = data?.templates || [];
  const previews = data?.previews || [];

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="font-display text-3xl font-extrabold text-white tracking-tight">Hinglish Nudge Preview</h1>
            <Badge variant="amber" className="font-mono text-xs">Preview Mode Only</Badge>
          </div>
          <p className="text-slate-400 mt-2">Preview SMS and Web Reauth reminder templates generated from decision records. No messages are sent.</p>
        </div>
      </div>

      {/* Templates Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5 text-cyan-400" />
            <span>Deterministic Reminder Templates</span>
          </CardTitle>
          <CardDescription>Localized Hinglish messaging templates tailored to failure cause.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {templates.map((tpl: any) => (
              <div key={tpl.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <Badge variant="purple" className="font-mono text-[9px]">{tpl.cause}</Badge>
                  <Badge variant="cyan" className="font-mono text-[9px]">{tpl.channel}</Badge>
                </div>
                <p className="text-xs text-slate-300 font-mono leading-relaxed pt-1">{tpl.template}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Live Previews */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <span>Generated Customer Previews ({previews.length})</span>
          </CardTitle>
          <CardDescription>Messages generated with real transaction values and guardrail checks applied.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500" />
            </div>
          ) : previews.length === 0 ? (
            <div className="text-center p-8 text-slate-500">No nudge previews generated.</div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {previews.map((item: any, idx: number) => (
                <div key={idx} className="border border-slate-800 bg-slate-950/40 rounded-xl p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-850 pb-3">
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-xs font-bold text-white">{item.transaction_id}</span>
                      <span className="text-xs text-slate-500 font-mono">({item.customer_id})</span>
                      <Badge variant="purple" className="font-mono text-[9px]">{item.failure_cause || 'unclassified'}</Badge>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Badge variant={item.contactAllowed ? 'emerald' : 'rose'} className="font-mono text-[9px] uppercase">
                        {item.contactAllowed ? 'GUARDRAILS PASSED' : 'GUARDRAIL BLOCKED'}
                      </Badge>
                      <Badge variant="cyan" className="font-mono text-[9px] uppercase">{item.channel}</Badge>
                    </div>
                  </div>

                  <div className="bg-slate-900/80 p-4 rounded-lg border border-slate-800/80 space-y-2">
                    <p className="text-xs text-slate-200 font-mono leading-relaxed">{item.message}</p>
                    <div className="flex justify-between items-center pt-2 text-[10px] text-slate-500 font-mono">
                      <span>Recent Nudges: {item.recentNudgesCount} / Cap: {item.nudgeCap}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[10px] border-slate-700"
                        onClick={() => handleCopy(item.message, idx)}
                      >
                        {copiedIndex === idx ? (
                          <>
                            <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-400" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3 mr-1" />
                            Copy Text
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {!item.contactAllowed && (
                    <div className="flex items-center space-x-2 text-xs text-rose-400 font-mono bg-rose-950/20 p-2.5 rounded-lg border border-rose-500/20">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{item.guardrailReason}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
