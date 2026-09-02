'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, LayoutDashboard, ShieldCheck, ListOrdered, Database, GitCommit, ShieldAlert, Calendar, History, Layers, MessageSquare } from 'lucide-react';
import { Badge } from './ui';

export function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Overview', href: '/', icon: LayoutDashboard },
    { name: 'Ingest', href: '/ingest', icon: Database },
    { name: 'Decisions', href: '/decisions', icon: GitCommit },
    { name: 'Guardrails', href: '/guardrails', icon: ShieldAlert },
    { name: 'Promises', href: '/promises', icon: Calendar },
    { name: 'Audit Trail', href: '/audit', icon: History },
    { name: 'Recovery Ledger', href: '/ledger', icon: Layers },
    { name: 'Nudges Preview', href: '/nudges', icon: MessageSquare },
    { name: 'Transactions', href: '/transactions', icon: ListOrdered },
  ];

  return (
    <aside className="w-64 h-screen sticky top-0 border-r border-zinc-700 bg-zinc-950 flex flex-col justify-between p-6 shrink-0">
      <div className="space-y-8">
        {/* Branding */}
        <Link href="/" className="flex items-center space-x-3 group">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 shadow-md shadow-blue-500/20 group-hover:scale-105 transition-all">
            <Activity className="h-5.5 w-5.5 text-white" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
            </span>
          </div>
          <div>
            <span className="font-display text-base font-extrabold tracking-tight text-white group-hover:text-cyan-400 transition-colors">
              MANDATE RESCUE
            </span>
            <div className="text-[9px] tracking-wider text-zinc-400 font-mono">AUTOPAY RECOVERY ENG</div>
          </div>
        </Link>

        {/* Navigation links */}
        <nav className="flex flex-col space-y-1.5">
          <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 font-mono px-3 mb-2">Navigation</span>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`inline-flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-semibold tracking-wide transition-all ${
                  isActive 
                    ? 'bg-zinc-800 text-white border border-zinc-750' 
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Compliance / Status Badge at bottom */}
      <div className="space-y-4 pt-4 border-t border-zinc-850">
        <div className="flex flex-col space-y-2 bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
          <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-400">
            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>Compliance Engine</span>
          </div>
          <p className="text-[10px] text-zinc-500 leading-normal font-medium">
            Active guardrail checks: retry limiters, quiet hours, and opt-outs.
          </p>
          <Badge variant="emerald" className="self-start font-mono text-[9px] px-1.5 py-0 border-0 bg-emerald-500/10 text-emerald-400 font-bold mt-1">ACTIVE</Badge>
        </div>
      </div>
    </aside>
  );
}
export default Sidebar;
