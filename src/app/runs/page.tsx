'use client';

import { History, Clock, BookOpen, ArrowRight } from 'lucide-react';
import Link from 'next/link';

// Placeholder — in production this is fetched from Supabase
const mockRuns: {
  id: string;
  target: string;
  tone: string;
  status: string;
  essayCount: number | null;
  createdAt: string;
  completedAt: string | null;
}[] = [];

export default function RunHistoryPage() {
  return (
    <div className="min-h-screen px-6 py-12 lg:px-16 max-w-5xl mx-auto">
      <div className="mb-10 animate-fade-in-up">
        <h1 className="text-2xl font-semibold mb-2 flex items-center gap-3 text-white">
          <History className="w-6 h-6 text-neutral-400" />
          Run History
        </h1>
        <p className="text-neutral-500 text-sm">
          View and manage your essay series generation runs.
        </p>
      </div>

      {mockRuns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 bg-black/50 p-16 text-center animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="w-12 h-12 rounded-lg bg-neutral-900 flex items-center justify-center mx-auto mb-4 border border-neutral-800">
            <BookOpen className="w-5 h-5 text-neutral-500" />
          </div>
          <p className="text-white text-sm font-medium mb-1">No runs yet</p>
          <p className="text-neutral-500 text-sm mb-6 max-w-sm mx-auto font-light">
            Start your first run to begin generating essay series from your philosophical corpus.
          </p>
          <Link
            href="/runs/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-white text-black font-medium text-sm hover:bg-neutral-200 transition-colors"
          >
            Create First Run
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div className="space-y-2 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          {mockRuns.map((run) => (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              className="bg-black border border-neutral-800 rounded-lg p-4 flex items-center gap-4 hover:bg-neutral-900/50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-md bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4 text-neutral-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate mb-1">
                  {run.target}
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {run.createdAt}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 roundedbg-neutral-900 text-neutral-400 border border-neutral-800 tracking-wide">
                    {run.tone}
                  </span>
                  {run.essayCount && (
                    <span className="text-[10px] text-neutral-500">
                      {run.essayCount} essays
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-[10px] px-2 py-1 rounded font-medium ${
                    run.status === 'completed'
                      ? 'bg-neutral-900 text-white border border-neutral-700'
                      : run.status === 'failed'
                      ? 'bg-red-950 text-red-400 border border-red-900'
                      : 'bg-neutral-900 text-neutral-300 border border-neutral-800'
                  }`}
                >
                  {run.status}
                </span>
                <ArrowRight className="w-4 h-4 text-neutral-600 group-hover:text-white transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
