'use client';

import { useEffect, useState } from 'react';
import { History, Clock, BookOpen, ArrowRight, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface Run {
  id: string;
  target_philosophy: string;
  tone_preset: string;
  status: string;
  total_essays: number | null;
  completed_essays: number | null;
  current_stage: number;
  created_at: string;
  error_message: string | null;
}

export default function RunHistoryPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchRuns() {
      const { data, error } = await supabase
        .from('runs')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setRuns(data);
      }
      setLoading(false);
    }

    fetchRuns();

    // Real-time subscription for live updates
    const channel = supabase
      .channel('runs-history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'runs' }, () => {
        fetchRuns();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'failed':
        return <XCircle className="w-3.5 h-3.5 text-red-400" />;
      default:
        return <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />;
    }
  };

  const statusBadge = (status: string) => {
    const base = 'text-[10px] px-2 py-1 rounded font-medium inline-flex items-center gap-1';
    switch (status) {
      case 'completed':
        return `${base} bg-emerald-950/50 text-emerald-400 border border-emerald-900/50`;
      case 'failed':
        return `${base} bg-red-950/50 text-red-400 border border-red-900/50`;
      default:
        return `${base} bg-violet-950/50 text-violet-300 border border-violet-900/50`;
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

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

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-neutral-500 animate-spin" />
        </div>
      ) : runs.length === 0 ? (
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
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              className="bg-black border border-neutral-800 rounded-lg p-4 flex items-center gap-4 hover:bg-neutral-900/50 hover:border-neutral-700 transition-all group"
            >
              <div className="w-10 h-10 rounded-md bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4 text-neutral-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate mb-1">
                  {run.target_philosophy}
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-[10px] text-neutral-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {timeAgo(run.created_at)}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-neutral-900 text-neutral-400 border border-neutral-800 tracking-wide">
                    {run.tone_preset}
                  </span>
                  {run.completed_essays != null && run.total_essays != null && (
                    <span className="text-[10px] text-neutral-500">
                      {run.completed_essays}/{run.total_essays} essays
                    </span>
                  )}
                  <span className="text-[10px] text-neutral-600">
                    Stage {run.current_stage}/16
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={statusBadge(run.status)}>
                  {statusIcon(run.status)}
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
