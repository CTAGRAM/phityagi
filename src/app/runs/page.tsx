'use client';

import { useEffect, useState } from 'react';
import { History, Clock, BookOpen, ArrowRight, CheckCircle2, XCircle, Loader2, Sparkles, FolderOpen, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const INTELLECTUAL_DOMAINS = [
  'All', 'Philosophy', 'Religion', 'Literature', 'History', 
  'Science', 'Law', 'Economics', 'Art', 
  'Language', 'Psychology', 'Politics', 'Technology',
  'Mathematics & Logic', 'Ethics', 'Medicine theory and practice'
];

interface Run {
  id: string;
  target_philosophy: string;
  domain_tag: string | null;
  domain_tags: string[];
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
  const [activeTab, setActiveTab] = useState('All');

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
    const base = 'text-[10px] px-2 py-1 rounded font-medium inline-flex items-center gap-1 shadow-sm';
    switch (status) {
      case 'completed':
        return `${base} bg-emerald-950/80 text-emerald-400 border border-emerald-900/50`;
      case 'failed':
        return `${base} bg-red-950/80 text-red-400 border border-red-900/50`;
      default:
        return `${base} bg-violet-950/80 text-violet-300 border border-violet-900/50`;
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

  const deleteBook = async (runId: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm('Are you sure you want to permanently delete this book and its corpus?')) return;
    
    const supabase = createClient();
    try {
      // 1. Delete from storage
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: files } = await supabase.storage.from('corpus_documents').list(`${user.id}/${runId}`);
        if (files && files.length > 0) {
          await supabase.storage.from('corpus_documents').remove(
            files.map(f => `${user.id}/${runId}/${f.name}`)
          );
        }
      }
      
      // 2. Delete from DB (cascade deletes concepts/documents)
      await supabase.from('runs').delete().eq('id', runId);
      
      // 3. Update UI
      setRuns(runs.filter(r => r.id !== runId));
    } catch (err) {
      console.error('Delete failed', err);
      alert('Failed to delete book.');
    }
  };

  const filteredRuns = activeTab === 'All' 
    ? runs 
    : runs.filter(r => (r.domain_tags && r.domain_tags.includes(activeTab)) || r.domain_tag === activeTab);

  // Group domains that actually have books for "All" tab view
  const activeDomains = Array.from(new Set(
    runs.flatMap(r => (r.domain_tags && r.domain_tags.length > 0) ? r.domain_tags : [r.domain_tag || 'Uncategorized'])
  ));

  return (
    <div className="min-h-screen px-6 py-12 lg:px-16 max-w-7xl mx-auto">
      <div className="mb-10 animate-fade-in-up">
        <h1 className="text-3xl font-semibold mb-3 flex items-center gap-3 text-white tracking-tight">
          <BookOpen className="w-7 h-7 text-violet-400" />
          GNOSIS Library
        </h1>
        <p className="text-neutral-400 text-sm font-light">
          Your synthesized knowledge base across 12 intellectual domains.
        </p>
      </div>

      {/* Domain Shelves Tabs */}
      <div className="flex overflow-x-auto pb-4 mb-8 custom-scrollbar gap-2 hide-scroll-bar animate-fade-in-up">
        {INTELLECTUAL_DOMAINS.map(domain => {
          // Count active books in this domain
          const count = domain === 'All' ? runs.length : runs.filter(r => (r.domain_tags && r.domain_tags.includes(domain)) || r.domain_tag === domain).length;
          // Hide empty tabs unless it's All
          if (count === 0 && domain !== 'All') return null;

          const isActive = activeTab === domain;

          return (
            <button
              key={domain}
              onClick={() => setActiveTab(domain)}
              className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                isActive 
                  ? 'bg-white text-black shadow-md' 
                  : 'bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-700'
              }`}
            >
              {domain}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-neutral-200 text-neutral-600' : 'bg-neutral-800 text-neutral-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 text-neutral-500 animate-spin" />
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-950/50 p-16 text-center animate-fade-in-up">
          <div className="w-14 h-14 rounded-2xl bg-neutral-900 flex items-center justify-center mx-auto mb-5 border border-neutral-800 shadow-inner">
            <FolderOpen className="w-6 h-6 text-neutral-500" />
          </div>
          <h3 className="text-white text-lg font-medium mb-2">Empty Library</h3>
          <p className="text-neutral-500 text-sm mb-8 max-w-md mx-auto font-light leading-relaxed">
            Begin the synthesis engine. Upload corpus documents and GNOSIS will auto-generate structured books on any topic.
          </p>
          <Link
            href="/runs/new"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-violet-600 text-white font-medium text-sm hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/20 transition-all"
          >
            Create First Book
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-neutral-500 text-sm">No synthesized documents in the {activeTab} shelf yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 animate-fade-in-up">
          {filteredRuns.map((run) => (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              className="group flex flex-col"
            >
              {/* Book Cover Design */}
              <div className="relative aspect-[3/4] w-full rounded-md shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] border border-neutral-800 overflow-hidden mb-4 transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-[0_20px_40px_-10px_rgba(139,92,246,0.15)] group-hover:border-neutral-700 bg-gradient-to-br from-neutral-900 to-black">
                {/* Book Spine Aesthetic */}
                <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-neutral-800/80 to-transparent border-r border-neutral-800/50 z-10"></div>
                
                {/* Book Content block */}
                <div className="absolute inset-0 p-5 flex flex-col justify-between z-20">
                  <div className="space-y-2">
                    <span className="inline-block text-[9px] font-bold tracking-widest uppercase text-violet-400/80 bg-violet-950/40 px-2 py-1 rounded">
                      {run.domain_tag || 'Uncategorized'}
                    </span>
                    <h3 className="text-sm font-semibold text-white leading-tight line-clamp-4 group-hover:text-violet-100 transition-colors">
                      {run.target_philosophy}
                    </h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="w-full bg-neutral-900 h-1 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-violet-500 transition-all duration-500"
                        style={{ width: `${(run.current_stage / 16) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-neutral-500 font-medium">Stage {run.current_stage}/16</span>
                      <span className="text-[10px] text-neutral-600 flex items-center gap-1">
                         <Clock className="w-3 h-3" /> {timeAgo(run.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Overlay & Actions */}
                <div className="absolute right-3 top-3 z-30">
                  <span className={statusBadge(run.status)}>
                    {statusIcon(run.status)}
                    {run.status}
                  </span>
                </div>

                <div className="absolute left-3 top-3 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => deleteBook(run.id, e)}
                    className="p-1.5 bg-red-950/80 text-red-400 border border-red-900/50 rounded hover:bg-red-900 hover:text-red-200 transition-colors shadow-sm"
                    title="Delete Book"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Title & Metadata beneath cover */}
              <div className="px-1 text-center">
                 <p className="text-xs font-medium text-neutral-300 truncate w-full group-hover:text-white transition-colors">{run.target_philosophy}</p>
                 <p className="text-[10px] text-neutral-500 mt-0.5">{run.tone_preset}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
