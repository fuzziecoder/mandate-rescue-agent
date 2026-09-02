'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, LayoutDashboard, ShieldCheck, ListOrdered } from 'lucide-react';
import { Badge } from './ui';

export function Header() {
  const pathname = usePathname();

  const navItems = [
    { name: 'Overview', href: '/', icon: LayoutDashboard },
    { name: 'Transactions', href: '/transactions', icon: ListOrdered },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#0B1120]/80 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-2.5 group">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 shadow-md shadow-blue-500/20 group-hover:scale-105 transition-all">
                <Activity className="h-5.5 w-5.5 text-white" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                </span>
              </div>
              <div>
                <span className="font-display text-lg font-bold tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                  MANDATE RESCUE
                </span>
                <div className="text-[10px] tracking-wider text-slate-400 font-mono">AUTOPAY RECOVERY ENG</div>
              </div>
            </Link>
          </div>
          
          <nav className="flex items-center space-x-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-semibold tracking-wide transition-all ${
                    isActive 
                      ? 'bg-slate-800 text-white border border-slate-700/30' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/20'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          <div className="hidden sm:flex items-center space-x-2 bg-slate-900/50 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span className="text-slate-400 font-medium">Compliance Guardrails:</span>
            <Badge variant="emerald" className="font-mono text-[10px] px-1 py-0 border-0 bg-transparent text-emerald-400 font-bold">ACTIVE</Badge>
          </div>
        </div>
      </div>
    </header>
  );
}
