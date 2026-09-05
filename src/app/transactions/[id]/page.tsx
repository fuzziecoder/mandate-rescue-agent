'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  CheckCircle2, 
  XCircle, 
  HelpCircle, 
  AlertTriangle,
  Clock, 
  MessageSquare,
  ShieldCheck, 
  Zap, 
  ChevronDown, 
  ChevronUp,
  FileCode,
  DollarSign
} from 'lucide-react';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  Badge, 
  Button, 
  Skeleton 
} from '@/components/ui';
import { PuterTieBreakAssistant } from '@/components/transactions/PuterTieBreakAssistant';

interface TraceData {
  transaction: {
    id: string;
    customer_id: string;
    amount: number;
    currency: string;
    mandate_id: string;
    bank_name: string;
    error_code: string;
    error_message: string;
    failed_at: string;
    customer_payment_history: {
      past_success_rate: number;
      avg_balance_pattern: 'normal' | 'low' | 'erratic';
      payment_timing?: 'on_time' | 'late' | 'very_late';
      opt_out?: boolean;
      recent_nudges_count?: number;
      past_retry_attempts?: number;
    };
    subscription_type: string;
  };
  classification: {
    transaction_id: string;
    predicted_cause: 'insufficient_balance' | 'bank_downtime' | 'mandate_expired' | 'limit_exceeded' | 'unknown';
    confidence: number;
    reasoning_text: string;
    method: 'rule' | 'llm';
  } | null;
  decision: {
    transaction_id: string;
    chosen_action: 'retry' | 'nudge' | 'reauth' | 'stop';
    reasoning_text: string;
    stop_reason?: string | null;
  } | null;
  guardrails: {
    id: number;
    transaction_id: string;
    check_name: 'retry_cap' | 'quiet_hours' | 'opt_out' | 'max_contacts';
    passed: boolean;
    detail: string;
  }[];
  execution: {
    transaction_id: string;
    action_taken: string;
    outcome: 'recovered' | 'still_failed' | 'pending' | 'stopped';
    amount_recovered: number;
    executed_at: string;
    stop_reason?: string | null;
  } | null;
  auditLogs: {
    id: number;
    transaction_id: string;
    stage: 'classify' | 'decide' | 'guardrail' | 'execute';
    payload: any;
    created_at: string;
  }[];
  nudgeMessage: string | null;
}

export default function TransactionTrace({ params }: { params: { id: string } }) {
  const { id } = params;
  const [loading, setLoading] = useState(true);
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  const fetchTrace = async () => {
    try {
      const res = await fetch(`/api/transactions/${id}`);
      const data = await res.json();
      if (data.success) {
        setTrace(data.trace);
      }
    } catch (error) {
      console.error('Error fetching transaction trace:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrace();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-28 rounded-xl" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="text-center py-16 space-y-4">
        <AlertTriangle className="mx-auto h-12 w-12 text-rose-400" />
        <h2 className="text-xl font-bold text-white">Transaction Not Found</h2>
        <p className="text-slate-400 max-w-sm mx-auto">
          The transaction ID <span className="font-mono text-rose-400">{id}</span> does not exist in the database.
        </p>
        <Link href="/transactions">
          <Button variant="outline" className="border-slate-800 hover:bg-slate-850">
            Back to Audit Trails
          </Button>
        </Link>
      </div>
    );
  }

  const { transaction, classification, decision, guardrails, execution, auditLogs, nudgeMessage } = trace;

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amt);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  // Determine stage status
  const getClassifyStatus = () => {
    if (!classification) return 'pending';
    return 'completed';
  };

  const getDecideStatus = () => {
    if (!decision) return 'pending';
    return 'completed';
  };

  const getGuardrailStatus = () => {
    if (guardrails.length === 0) return 'pending';
    const failed = guardrails.some(g => !g.passed);
    return failed ? 'failed' : 'passed';
  };

  const getExecuteStatus = () => {
    if (!execution) {
      const isGuardrailFailed = guardrails.some(g => !g.passed);
      return isGuardrailFailed ? 'skipped' : 'pending';
    }
    return execution.outcome;
  };

  const renderStageIndicator = (status: 'pending' | 'completed' | 'passed' | 'failed' | 'skipped' | 'recovered' | 'still_failed' | 'stopped') => {
    const styles = {
      pending: 'bg-slate-800 text-slate-500 border-slate-700',
      completed: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
      passed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      failed: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      skipped: 'bg-slate-900 text-slate-600 border-slate-800',
      recovered: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      still_failed: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
      stopped: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    };

    const icons = {
      pending: <Clock className="h-4.5 w-4.5" />,
      completed: <CheckCircle2 className="h-4.5 w-4.5" />,
      passed: <CheckCircle2 className="h-4.5 w-4.5" />,
      failed: <XCircle className="h-4.5 w-4.5" />,
      skipped: <XCircle className="h-4.5 w-4.5" />,
      recovered: <CheckCircle2 className="h-4.5 w-4.5" />,
      still_failed: <XCircle className="h-4.5 w-4.5" />,
      stopped: <ShieldCheck className="h-4.5 w-4.5" />
    };

    return (
      <div className={`flex h-8 w-8 items-center justify-center rounded-full border shrink-0 ${styles[status]}`}>
        {icons[status] || <HelpCircle className="h-4.5 w-4.5" />}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      
      {/* Back button */}
      <Link href="/transactions" className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors">
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Audit Trails</span>
      </Link>

      {/* Transaction Summary Card */}
      <Card className="border-zinc-700 bg-black p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono tracking-widest text-cyan-400 font-bold uppercase">Transaction Trace</span>
              <Badge className="font-mono text-[10px]">{transaction.id}</Badge>
            </div>
            <h2 className="font-display text-lg font-bold text-white">
              {transaction.subscription_type}
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Customer: <span className="font-mono text-slate-350">{transaction.customer_id}</span> • Bank: <span className="text-slate-350">{transaction.bank_name}</span>
            </p>
          </div>

          <div className="flex flex-col items-start md:items-end">
            <div className="text-xl font-bold text-white font-mono tabular-nums">
              {formatCurrency(transaction.amount)}
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              Failed at {formatDate(transaction.failed_at)}
            </span>
          </div>
        </div>

        {/* Error diagnosis callout */}
        <div className="mt-5 p-3 rounded-lg border border-red-500/10 bg-red-500/[0.02] flex items-start space-x-3">
          <AlertTriangle className="h-4.5 w-4.5 text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-mono font-bold text-rose-400 uppercase mr-2">Gateway Decline Code: {transaction.error_code}</span>
            <p className="text-slate-350 mt-1 italic font-medium">&quot;{transaction.error_message}&quot;</p>
          </div>
        </div>
      </Card>


      {/* Stepper Pipeline Timeline */}
      <div className="space-y-6 relative before:absolute before:left-4 before:top-4 before:bottom-4 before:w-[1.5px] before:bg-slate-800">
        
        {/* Stage 1: CLASSIFY */}
        <div className="flex gap-4 relative">
          {renderStageIndicator(getClassifyStatus())}
          
          <Card className={`flex-1 border-zinc-700 bg-black ${getClassifyStatus() === 'pending' ? 'opacity-50' : ''}`}>
            <CardHeader className="p-4 pb-2 flex-row justify-between items-center space-y-0">
              <div>
                <CardTitle className="text-sm font-bold flex items-center space-x-2">
                  <span>Stage 1: Error Classification</span>
                </CardTitle>
                <CardDescription className="text-[10px]">
                  Diagnose decline code via rules or Claude tie-breaker logic.
                </CardDescription>
              </div>
              {classification && (
                <Badge variant={classification.method === 'llm' ? 'violet' : 'slate'} className="text-[9px] font-semibold border-0 uppercase">
                  {classification.method === 'llm' ? 'LLM Classifier' : 'Rule Heuristics'}
                </Badge>
              )}
            </CardHeader>
            
            <CardContent className="p-4 pt-0">
              {classification ? (
                <div className="space-y-2 mt-2">
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-slate-400">Diagnosis:</span>
                    <span className="font-bold text-slate-200 capitalize">
                      {classification.predicted_cause.replace('_', ' ')}
                    </span>
                    <span className="text-slate-500 font-mono text-[10px]">
                      (Confidence: {Math.round(classification.confidence * 100)}%)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed font-medium">
                    {classification.reasoning_text}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic mt-2">Awaiting classification trigger...</p>
              )}

              {/* Optional Puter AI Tie-Break Assistant */}
              <div className="mt-4 pt-3 border-t border-slate-800">
                <PuterTieBreakAssistant
                  transactionId={transaction.id}
                  errorCode={transaction.error_code}
                  errorMessage={transaction.error_message}
                  bankName={transaction.bank_name}
                  amount={transaction.amount}
                  failedAt={transaction.failed_at}
                  currentCause={classification?.predicted_cause}
                  currentClassifier={classification?.method}
                  currentConfidence={classification?.confidence}
                  onSuggestionApplied={fetchTrace}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Stage 2: DECIDE */}
        <div className="flex gap-4 relative">
          {renderStageIndicator(getDecideStatus())}
          
          <Card className={`flex-1 border-zinc-700 bg-black ${getDecideStatus() === 'pending' ? 'opacity-50' : ''}`}>
            <CardHeader className="p-4 pb-2 flex-row justify-between items-center space-y-0">
              <div>
                <CardTitle className="text-sm font-bold">
                  Stage 2: Deterministic Decision Engine
                </CardTitle>
                <CardDescription className="text-[10px]">
                  Map diagnosis & customer payment history into recovery actions (No AI).
                </CardDescription>
              </div>
              {decision && (
                <Badge className={`text-[9px] font-semibold uppercase border ${
                  decision.chosen_action === 'stop' ? 'text-rose-450 border-rose-500/20 bg-rose-500/10' : 'text-cyan-400 border-cyan-500/20 bg-cyan-500/10'
                }`}>
                  {decision.chosen_action}
                </Badge>
              )}
            </CardHeader>
            
            <CardContent className="p-4 pt-0">
              {decision ? (
                <div className="space-y-2 mt-2">
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-slate-400">Chosen Action:</span>
                    <span className="font-bold text-slate-200 uppercase tracking-wider text-[10px]">
                      {decision.chosen_action}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed font-medium">
                    {decision.reasoning_text}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic mt-2">Awaiting decision logic trigger...</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stage 3: GUARDRAIL */}
        <div className="flex gap-4 relative">
          {renderStageIndicator(getGuardrailStatus())}
          
          <Card className={`flex-1 border-zinc-700 bg-black ${getGuardrailStatus() === 'pending' ? 'opacity-50' : ''}`}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold flex items-center space-x-2">
                <span>Stage 3: Compliance Guardrails</span>
              </CardTitle>
              <CardDescription className="text-[10px]">
                Validate legal compliance limits, contact caps, quiet hours, and opt-out checks.
              </CardDescription>
            </CardHeader>
            
            <CardContent className="p-4 pt-0">
              {guardrails.length > 0 ? (
                <div className="mt-3 space-y-2.5">
                  {guardrails.map((check) => (
                    <div key={check.id} className="flex items-start space-x-3 text-xs border-b border-slate-800/40 pb-2 last:border-0 last:pb-0">
                      {check.passed ? (
                        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="h-4.5 w-4.5 text-rose-450 shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-0.5">
                        <span className="font-mono text-[10px] font-bold text-slate-350 uppercase tracking-wide">
                          {check.check_name.replace('_', ' ')}
                        </span>
                        <p className="text-slate-400 font-medium leading-relaxed">{check.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic mt-2">Awaiting compliance inspection...</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Stage 4: EXECUTE */}
        <div className="flex gap-4 relative">
          {renderStageIndicator(getExecuteStatus())}
          
          <Card className={`flex-1 border-zinc-700 bg-black ${getExecuteStatus() === 'pending' ? 'opacity-50' : ''}`}>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-bold">
                Stage 4: Recovery Execution
              </CardTitle>
              <CardDescription className="text-[10px]">
                Simulate recovery outcomes or document stopped process audits.
              </CardDescription>
            </CardHeader>
            
            <CardContent className="p-4 pt-0">
              {execution ? (
                <div className="space-y-4 mt-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                    <div className="bg-zinc-950 border border-zinc-750 p-2 rounded-lg">
                      <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Action Taken</span>
                      <span className="font-bold text-slate-200 uppercase tracking-wider">{execution.action_taken}</span>
                    </div>
                    
                    <div className="bg-zinc-950 border border-zinc-750 p-2 rounded-lg">
                      <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Outcome</span>
                      <span className={`font-bold uppercase tracking-wider ${
                        execution.outcome === 'recovered' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>{execution.outcome}</span>
                    </div>

                    <div className="bg-zinc-950 border border-zinc-750 p-2 rounded-lg">
                      <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Recovered Amount</span>
                      <span className="font-bold text-white tabular-nums">{formatCurrency(execution.amount_recovered)}</span>
                    </div>

                    <div className="bg-zinc-950 border border-zinc-750 p-2 rounded-lg">
                      <span className="text-slate-500 block text-[9px] uppercase tracking-wider">Executed At</span>
                      <span className="text-[10px] text-slate-350">{new Date(execution.executed_at).toLocaleTimeString('en-IN', {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</span>
                    </div>
                  </div>

                  {execution.outcome === 'stopped' && (
                    <div className="p-3 border border-red-500/10 bg-red-500/[0.01] rounded-lg text-xs flex items-center space-x-2 text-rose-400">
                      <ShieldCheck className="h-4.5 w-4.5 shrink-0" />
                      <span>Pipeline Stopped: {execution.stop_reason || 'Manual Review Triggered'}</span>
                    </div>
                  )}

                  {/* Nudge sms bubble detail */}
                  {nudgeMessage && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-mono text-slate-400 font-bold uppercase tracking-wider flex items-center">
                        <MessageSquare className="h-3.5 w-3.5 text-amber-500 mr-1.5" />
                        Sent Hinglish Recovery Message (SMS)
                      </span>
                      <div className="rounded-2xl rounded-tl-none border border-slate-800 bg-[#0B1120] p-3 text-xs leading-relaxed text-slate-200">
                        {nudgeMessage}
                      </div>
                    </div>
                  )}
                </div>
              ) : getExecuteStatus() === 'skipped' ? (
                <div className="p-3 border border-slate-800 bg-slate-900/30 rounded-lg text-xs text-slate-500 italic mt-2">
                  Execution stage skipped due to guardrail check failure.
                </div>
              ) : (
                <p className="text-xs text-slate-500 italic mt-2">Awaiting execution outcome...</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Raw audit log inspect section */}
      <Card className="border-zinc-700 bg-black overflow-hidden">
        <button
          onClick={() => setShowLogs(prev => !prev)}
          className="w-full px-6 py-4 flex items-center justify-between text-slate-350 hover:text-white hover:bg-slate-900/10 transition-colors"
        >
          <div className="flex items-center space-x-2">
            <FileCode className="h-4.5 w-4.5 text-cyan-400" />
            <span className="text-xs font-bold font-display uppercase tracking-wider">Raw System Audit Trails (JSON)</span>
          </div>
          {showLogs ? <ChevronUp className="h-4.5 w-4.5" /> : <ChevronDown className="h-4.5 w-4.5" />}
        </button>
        
        {showLogs && (
          <CardContent className="p-4 border-t border-slate-800 bg-[#070C19]/60">
            <div className="space-y-4 max-h-96 overflow-y-auto font-mono text-[10px] text-slate-400">
              {auditLogs.map((log) => (
                <div key={log.id} className="border border-slate-900 bg-[#0B1120] rounded-lg p-3 space-y-2">
                  <div className="flex justify-between items-center text-slate-500 border-b border-slate-900 pb-1">
                    <span>STAGE: <span className="font-bold text-slate-350 uppercase">{log.stage}</span></span>
                    <span>{formatDate(log.created_at)}</span>
                  </div>
                  <pre className="overflow-x-auto text-[9px] text-cyan-500/80 max-h-48">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
