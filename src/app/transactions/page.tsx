'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ArrowUpDown, 
  ArrowUpRight,
  Filter,
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  HelpCircle,
  TrendingUp,
  SlidersHorizontal,
  Loader2
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
import Link from 'next/link';

export default function TransactionsList() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  
  // Search, Filtering, Sorting, Pagination States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [causeFilter, setCauseFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  
  const [sortField, setSortField] = useState<'amount' | 'failed_at'>('failed_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/transactions?pageSize=300&debug=true');
      const json = await res.json();
      if (json.data) {
        setTransactions(json.data);
      }
      if (json.debug) {
        setDebugInfo(json.debug);
      }
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amt);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleSort = (field: 'amount' | 'failed_at') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesSearch = 
        !searchTerm ||
        tx.customer_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.bank_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.subscription_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tx.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || statusFilter === 'All' || tx.outcome.toLowerCase() === statusFilter.toLowerCase();
      const matchesCause = causeFilter === 'all' || causeFilter === 'All' || tx.failure_cause === causeFilter;
      const matchesMethod = methodFilter === 'all' || methodFilter === 'All' || tx.classifier === methodFilter;

      return matchesSearch && matchesStatus && matchesCause && matchesMethod;
    });
  }, [transactions, searchTerm, statusFilter, causeFilter, methodFilter]);

  const sortedTransactions = useMemo(() => {
    const sorted = [...filteredTransactions];
    sorted.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'failed_at') {
        valA = new Date(valA || 0).getTime();
        valB = new Date(valB || 0).getTime();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredTransactions, sortField, sortDirection]);

  const totalPages = Math.ceil(sortedTransactions.length / pageSize) || 1;
  const paginatedTransactions = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedTransactions.slice(start, start + pageSize);
  }, [sortedTransactions, currentPage, pageSize]);

  const getStatusBadge = (outcome: string) => {
    const lower = outcome.toLowerCase();
    if (lower === 'recovered') {
      return (
        <Badge variant="emerald" className="flex items-center gap-1 w-fit">
          <CheckCircle2 className="h-3 w-3" />
          <span>Recovered</span>
        </Badge>
      );
    }
    if (lower === 'failed' || lower === 'still_failed') {
      return (
        <Badge variant="rose" className="flex items-center gap-1 w-fit">
          <XCircle className="h-3 w-3" />
          <span>Failed</span>
        </Badge>
      );
    }
    if (lower === 'stopped') {
      return (
        <Badge variant="rose" className="flex items-center gap-1 w-fit bg-rose-500/10 text-rose-400 border-rose-500/20">
          <AlertTriangle className="h-3 w-3" />
          <span>Stopped</span>
        </Badge>
      );
    }
    return (
      <Badge variant="cyan" className="flex items-center gap-1 w-fit">
        <HelpCircle className="h-3 w-3" />
        <span>Pending</span>
      </Badge>
    );
  };

  const getCauseBadge = (cause: string | null) => {
    if (!cause) return <Badge variant="slate" className="text-slate-500">Unclassified</Badge>;
    const names: Record<string, string> = {
      insufficient_balance: 'Low Balance',
      bank_downtime: 'Bank Offline',
      mandate_expired: 'Expired',
      limit_exceeded: 'Limit Hit',
      unknown: 'Ambiguous'
    };
    return (
      <Badge variant="purple" className="font-mono text-[10px]">
        {names[cause] || cause}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Subscription Failure Register
        </h1>
        <p className="mt-1.5 text-slate-400 font-medium max-w-2xl">
          Drill down into individual autopay failures to inspect root-cause analysis, deterministic decisions, and compliance guardrail reports.
        </p>
      </div>

      <Card className="border-zinc-700 bg-black">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-white flex items-center space-x-2">
                <span>Transactions Ledger ({sortedTransactions.length})</span>
              </CardTitle>
              <CardDescription>
                Live stream of failed mandate transactions ingestion.
              </CardDescription>
            </div>
            
            {/* Filter controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search customer, bank, ID..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 pr-4 py-1.5 bg-zinc-950/90 border border-zinc-800 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 rounded-lg w-48 sm:w-64 font-mono transition-colors"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-zinc-950/90 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 cursor-pointer transition-colors"
              >
                <option value="all" className="bg-zinc-950 text-slate-200">All Outcomes</option>
                <option value="recovered" className="bg-zinc-950 text-slate-200">Recovered</option>
                <option value="pending" className="bg-zinc-950 text-slate-200">Pending</option>
                <option value="failed" className="bg-zinc-950 text-slate-200">Failed</option>
                <option value="stopped" className="bg-zinc-950 text-slate-200">Stopped</option>
              </select>

              {/* Cause Filter */}
              <select
                value={causeFilter}
                onChange={(e) => {
                  setCauseFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-zinc-950/90 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 cursor-pointer transition-colors"
              >
                <option value="all" className="bg-zinc-950 text-slate-200">All Causes</option>
                <option value="insufficient_balance" className="bg-zinc-950 text-slate-200">Low Balance</option>
                <option value="bank_downtime" className="bg-zinc-950 text-slate-200">Bank Offline</option>
                <option value="mandate_expired" className="bg-zinc-950 text-slate-200">Mandate Expired</option>
                <option value="limit_exceeded" className="bg-zinc-950 text-slate-200">Limit Exceeded</option>
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="space-y-3 py-4">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : sortedTransactions.length === 0 ? (
            <div className="py-12 text-center text-slate-500 space-y-2 border border-dashed border-slate-800 rounded-xl">
              <Filter className="h-8 w-8 mx-auto text-slate-600" />
              <p className="text-sm font-medium">No records match the selected filters.</p>
              <p className="text-xs text-slate-600 font-mono">Dataset contains {transactions.length} records in total.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400 font-display">
                    <th className="py-3 px-4">Transaction / Customer</th>
                    <th 
                      className="py-3 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('amount')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Amount</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4">Bank & Subscription</th>
                    <th className="py-3 px-4">Cause</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Outcome</th>
                    <th 
                      className="py-3 px-4 cursor-pointer hover:text-white transition-colors"
                      onClick={() => handleSort('failed_at')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Failed At</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </div>
                    </th>
                    <th className="py-3 px-4 text-right">Trace</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850 text-sm">
                  {paginatedTransactions.map(tx => (
                    <tr 
                      key={tx.id} 
                      className="hover:bg-slate-900/40 transition-colors group cursor-pointer"
                      onClick={() => router.push(`/transactions/${tx.id}`)}
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs font-bold text-white group-hover:text-cyan-400 transition-colors">
                          {tx.id}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {tx.customer_id}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-white tabular-nums">
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs font-medium text-slate-200">{tx.bank_name}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[150px]">{tx.subscription_type}</div>
                      </td>
                      <td className="py-3 px-4">
                        {getCauseBadge(tx.failure_cause)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs text-slate-300 uppercase">
                          {tx.action_chosen || 'stop'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(tx.outcome)}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-400 whitespace-nowrap">
                        {formatDate(tx.failed_at)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link 
                          href={`/transactions/${tx.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center text-xs font-semibold text-cyan-400 hover:text-cyan-300 font-mono"
                        >
                          Inspect <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer & Pagination */}
          {!loading && sortedTransactions.length > 0 && (
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800 text-xs text-slate-400">
              <div className="font-mono">
                Showing {Math.min(sortedTransactions.length, (currentPage - 1) * pageSize + 1)} - {Math.min(sortedTransactions.length, currentPage * pageSize)} of {sortedTransactions.length} records
              </div>
              
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="h-8 border-slate-800"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                </Button>
                <span className="font-mono text-xs text-slate-300 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8 border-slate-800"
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Debug text in development */}
          {debugInfo && (
            <div className="mt-6 pt-4 border-t border-slate-850 text-[10px] font-mono text-slate-500 flex justify-between">
              <span>API records: {sortedTransactions.length} / Dataset total: {debugInfo.transactionCount}</span>
              <span>DB Path: {debugInfo.dbPath}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
