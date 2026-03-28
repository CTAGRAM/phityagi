'use client';

import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  AlertTriangle,
  Download,
  FileText,
  List,
  ChevronDown,
  ChevronUp,
  BookMarked,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { PIPELINE_STAGES } from '@/lib/constants';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── EssaysTab: Fetches and Renders Real Essays from DB ───────────────────────

interface Essay {
  id: string;
  essay_number: number;
  title: string;
  content: string;
  status: string;
  created_at: string;
}

function EssaysTab({ runId, run }: { runId: string; run: any }) {
  const [essays, setEssays] = useState<Essay[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function fetchEssays() {
      const { data } = await supabase
        .from('essays')
        .select('*')
        .eq('run_id', runId)
        .order('essay_number', { ascending: true });
      setEssays(data || []);
      setLoading(false);
    }

    fetchEssays();

    // Real-time: subscribe to new essays being inserted
    const sub = supabase
      .channel(`essays_${runId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'essays', filter: `run_id=eq.${runId}` }, () => {
        fetchEssays();
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, [runId]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
      <div className="border border-neutral-800 bg-neutral-900/50 rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-white">
            {run.completed_essays || 0} of {run.total_essays || '?'} essays drafted
          </p>
          {run.total_essays ? (
            <p className="text-xs font-semibold text-neutral-500">
              {Math.round(((run.completed_essays || 0) / run.total_essays) * 100)}% complete
            </p>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-600" />
        </div>
      ) : essays.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-neutral-800 rounded-lg">
          <FileText className="w-8 h-8 text-neutral-700 mx-auto mb-3" />
          <p className="text-sm font-medium text-neutral-400">No essays generated yet.</p>
          <p className="text-xs text-neutral-600 mt-1 max-w-sm mx-auto leading-relaxed">
            Chapters will appear here automatically as the pipeline progresses past Stage 12.
          </p>
        </div>
      ) : (
        essays.map((essay) => (
          <div key={essay.id} className="border border-neutral-800 rounded-lg overflow-hidden bg-black">
            <button
              onClick={() => setExpanded(expanded === essay.id ? null : essay.id)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-neutral-900/60 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-neutral-600 w-6 shrink-0">
                  {String(essay.essay_number).padStart(2, '0')}
                </span>
                <div>
                  <p className="text-sm font-medium text-white">{essay.title}</p>
                  <p className="text-[10px] text-neutral-500 mt-0.5 uppercase tracking-wider">
                    {essay.status === 'completed' ? '✓ Completed' : essay.status}
                  </p>
                </div>
              </div>
              {expanded === essay.id ? (
                <ChevronUp className="w-4 h-4 text-neutral-500 shrink-0" />
              ) : (
                <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />
              )}
            </button>
            <AnimatePresence>
              {expanded === essay.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-neutral-800 px-5 py-5">
                    <pre className="text-xs text-neutral-300 whitespace-pre-wrap leading-relaxed font-sans max-h-[600px] overflow-y-auto">
                      {essay.content}
                    </pre>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))
      )}
    </motion.div>
  );
}

// ─── Main RunDetailPage ────────────────────────────────────────────────────────

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.id as string;
  const [activeTab, setActiveTab] = useState<'progress' | 'essays' | 'package'>('progress');
  
  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRun() {
      if (!runId) return;
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('runs')
          .select('*')
          .eq('id', runId)
          .single();

        if (error) throw error;
        setRun(data);
      } catch (err: any) {
        console.error('Error fetching run:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchRun();

    // Optionally set up real-time subscription here later
    const supabase = createClient();
    const subscription = supabase
      .channel(`run_${runId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'runs', filter: `id=eq.${runId}` }, (payload) => {
        setRun(payload.new);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [runId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-6">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-medium mb-2">Run Not Found</h2>
        <p className="text-neutral-500 text-sm mb-6">{error || 'Could not locate pipeline execution.'}</p>
        <Link href="/runs" className="text-sm underline hover:text-white transition-colors">
          Return to History
        </Link>
      </div>
    );
  }

  const progress = Math.round((run.current_stage / PIPELINE_STAGES.length) * 100);

  return (
    <div className="min-h-screen px-6 py-8 lg:px-12 lg:py-10 max-w-5xl mx-auto">
      {/* Back + Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <Link
          href="/runs"
          className="inline-flex items-center gap-2 text-neutral-500 hover:text-white text-xs mb-6 transition-colors font-medium tracking-wide"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          BACK TO HISTORY
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight mb-3">
              {run.target_philosophy}
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500 flex items-center gap-1.5 font-medium">
                <Clock className="w-3.5 h-3.5" />
                {new Date(run.created_at).toLocaleDateString()}
              </span>
              <span className="text-[10px] px-2 py-1 rounded-md uppercase tracking-wider font-semibold bg-neutral-900 text-neutral-400 border border-neutral-800 border-b-2">
                {run.tone_preset}
              </span>
              <span className={`text-[10px] px-2 py-1 rounded-md uppercase tracking-wider font-bold flex items-center gap-1.5 ${run.status === 'completed' ? 'bg-white text-black' : 'bg-neutral-900 text-white border border-neutral-700'}`}>
                {run.status === 'pending' || run.status === 'extracting' ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {run.status}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Progress Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="border border-neutral-800 bg-black rounded-lg p-6 mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium text-white">Pipeline Progress</p>
          <p className="text-xs font-medium text-neutral-500">{progress}%</p>
        </div>
        <div className="w-full h-1.5 rounded-full bg-neutral-900 overflow-hidden mb-3">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="h-full bg-white"
          />
        </div>
        <p className="text-xs text-neutral-500 font-medium">
          Stage {run.current_stage} of {PIPELINE_STAGES.length} —{' '}
          <span className="text-white">{PIPELINE_STAGES[run.current_stage - 1]?.name || 'Unknown'}</span>
        </p>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 border-b border-neutral-800 pb-0 w-full">
        {[
          { id: 'progress' as const, label: 'Pipeline', icon: List },
          { id: 'essays' as const, label: 'Essays', icon: FileText },
          { id: 'package' as const, label: 'Download', icon: Download },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold transition-all border-b-2 ${
              activeTab === tab.id
                ? 'text-white border-white'
                : 'text-neutral-500 hover:text-neutral-300 border-transparent'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="pb-24">
        {activeTab === 'progress' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-1.5"
          >
            {PIPELINE_STAGES.map((stage) => {
              const isDone = stage.id < run.current_stage;
              const isCurrent = stage.id === run.current_stage;
              const isPending = stage.id > run.current_stage;

              return (
                <div
                  key={stage.id}
                  className={`flex items-center gap-4 px-5 py-4 rounded-md border transition-all ${
                    isCurrent
                      ? 'bg-neutral-900 border-neutral-600'
                      : isDone
                      ? 'bg-black border-neutral-800/60 opacity-60'
                      : 'bg-black border-neutral-900 opacity-40'
                  }`}
                >
                  <div className="w-6 h-6 rounded flex items-center justify-center shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-neutral-700" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm ${isCurrent ? 'text-white font-medium' : isDone ? 'text-neutral-400' : 'text-neutral-600'}`}>
                      {stage.name}
                    </p>
                  </div>
                  <span className="text-[10px] font-medium tracking-wider text-neutral-600">
                    STAGE {stage.id}
                  </span>
                </div>
              );
            })}
          </motion.div>
        )}

        {activeTab === 'essays' && (
          <EssaysTab runId={runId} run={run} />
        )}

        {activeTab === 'package' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`border rounded-lg p-10 text-center ${run.status === 'completed' ? 'border-neutral-700 bg-neutral-900/30' : 'border-dashed border-neutral-800'}`}
          >
            {run.status === 'completed' ? (
              <>
                <Download className="w-8 h-8 text-white mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Series Fully Generated</h3>
                <p className="text-sm text-neutral-400 max-w-md mx-auto mb-8 leading-relaxed">
                  Your philosophical essay series on <strong>{run.target_philosophy}</strong> is complete. 
                  You can now export the compiled package as Markdown, Word, PDF, or raw JSON metadata for your archives.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
                  <button 
                    onClick={async () => {
                      try {
                        const supabase = createClient();
                        const { data: essays } = await supabase.from('essays').select('*').eq('run_id', run.id).order('essay_number', { ascending: true });
                        if (!essays) return;
                        
                        let markdownContent = `# ${run.target_philosophy} — Philosophy Series\n\n`;
                        markdownContent += `*Generated by Philosophy Series Engine*\n*Date: ${new Date(run.created_at).toLocaleDateString()}*\n*Tone: ${run.tone_preset}*\n\n---\n\n`;
                        
                        essays.forEach(e => {
                          markdownContent += `## Chapter ${e.essay_number}: ${e.title}\n\n${e.content}\n\n---\n\n`;
                        });

                        const blob = new Blob([markdownContent], { type: 'text/markdown' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${run.target_philosophy.replace(/\s+/g, '_').toLowerCase()}_series.md`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      } catch(e) { console.error(e); alert("Failed to download Markdown."); }
                    }}
                    className="w-full px-6 py-3 rounded-md bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Markdown (.md)
                  </button>
                  <button 
                    onClick={async () => {
                      try {
                        const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx');
                        const { saveAs } = await import('file-saver');
                        const supabase = createClient();
                        const { data: essays } = await supabase.from('essays').select('*').eq('run_id', run.id).order('essay_number', { ascending: true });
                        if (!essays) return;

                        const children: any[] = [
                          new Paragraph({
                            text: `${run.target_philosophy} — Philosophy Series`,
                            heading: HeadingLevel.TITLE,
                          }),
                          new Paragraph({
                            text: `Generated by Philosophy Series Engine | Date: ${new Date(run.created_at).toLocaleDateString()}`,
                            spacing: { after: 400 },
                          }),
                        ];

                        essays.forEach((e) => {
                          children.push(
                            new Paragraph({
                              text: `Chapter ${e.essay_number}: ${e.title}`,
                              heading: HeadingLevel.HEADING_1,
                              spacing: { before: 400, after: 200 },
                            })
                          );
                          const paragraphs = e.content.split('\n\n');
                          paragraphs.forEach((pStr: string) => {
                            children.push(
                              new Paragraph({
                                children: [new TextRun(pStr)],
                                spacing: { after: 200 },
                              })
                            );
                          });
                        });

                        const doc = new Document({
                          sections: [{ properties: {}, children }],
                        });

                        const blob = await Packer.toBlob(doc);
                        saveAs(blob, `${run.target_philosophy.replace(/\s+/g, '_').toLowerCase()}_series.docx`);
                      } catch(e) { console.error(e); alert("Failed to download DOCX."); }
                    }}
                    className="w-full px-6 py-3 rounded-md bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 border border-blue-500"
                  >
                    <FileText className="w-4 h-4" />
                    Word (.docx)
                  </button>
                  <button 
                    onClick={() => {
                      window.open(`/runs/${run.id}/print`, '_blank');
                    }}
                    className="w-full px-6 py-3 rounded-md bg-red-600/20 text-red-500 font-semibold text-sm hover:bg-red-600/30 transition-colors flex items-center justify-center gap-2 border border-red-900/50"
                  >
                    <BookMarked className="w-4 h-4" />
                    PDF Book (.pdf)
                  </button>
                  <button 
                    onClick={async () => {
                       try {
                        const supabase = createClient();
                        const [{ data: runData }, { data: essays }] = await Promise.all([
                          supabase.from('runs').select('*').eq('id', run.id).single(),
                          supabase.from('essays').select('*').eq('run_id', run.id).order('essay_number', { ascending: true })
                        ]);
                        
                        const payload = JSON.stringify({ metadata: runData, essays }, null, 2);
                        const blob = new Blob([payload], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${run.target_philosophy.replace(/\s+/g, '_').toLowerCase()}_metadata.json`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                      } catch(e) { console.error(e); alert("Failed to download JSON."); }
                    }}
                    className="w-full px-6 py-3 rounded-md bg-black text-white border border-neutral-700 font-medium text-sm hover:bg-neutral-900 transition-colors flex items-center justify-center gap-2"
                  >
                    {'{ }'} Raw JSON
                  </button>
                </div>
              </>
            ) : (
              <>
                <Download className="w-8 h-8 text-neutral-700 mx-auto mb-4" />
                <p className="text-sm font-medium text-neutral-400 mb-1">Package not ready yet</p>
                <p className="text-xs text-neutral-600 max-w-sm mx-auto leading-relaxed">
                  The finalized Markdown and JSON package export will be available once all pipeline stages are completely finished.
                </p>
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
