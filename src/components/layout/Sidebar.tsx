'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  PlusCircle,
  History,
  Settings,
  BookOpen,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/runs/new', label: 'New Run', icon: PlusCircle },
  { href: '/runs', label: 'History', icon: History },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`relative sticky top-0 h-screen shrink-0 flex flex-col bg-black border-r border-[#27272a] transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[72px]' : 'w-[260px]'
      }`}
    >
      {/* Search / Brand Header */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-[#27272a] shrink-0">
        <div className="w-8 h-8 rounded bg-white flex items-center justify-center shrink-0">
          <BookOpen className="w-4 h-4 text-black" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden flex-1 fade-in">
            <h1 className="text-sm font-semibold text-white tracking-tight whitespace-nowrap">
              Engine
            </h1>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150 group ${
                isActive
                  ? 'bg-neutral-900 text-white font-medium'
                  : 'text-neutral-400 hover:text-white hover:bg-neutral-800 border-transparent'
              }`}
            >
              <item.icon
                className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                  isActive ? 'text-white' : 'text-neutral-500 group-hover:text-neutral-300'
                }`}
              />
              {!collapsed && (
                <span className="whitespace-nowrap">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-3 border-t border-[#27272a]">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full p-2 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-800 transition-all flex items-center justify-center"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
