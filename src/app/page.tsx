'use client';

import Link from 'next/link';
import { PlusCircle, BookOpen, Sparkles, BrainCircuit, Workflow, ShieldCheck, ArrowRight, Layers } from 'lucide-react';

const features = [
  {
    icon: BrainCircuit,
    title: 'Deep Extraction',
    description: 'Isolating core philosophical arguments without hallucination.',
  },
  {
    icon: Workflow,
    title: '16-Stage Intelligence',
    description: 'Autonomous pipeline orchestrating drafting, and cross-referencing.',
  },
  {
    icon: ShieldCheck,
    title: 'Scholarly Rigor',
    description: 'Every claim is structurally tied back to the primary source.',
  },
  {
    icon: Layers,
    title: 'Coherent Series',
    description: 'A single integrated work with complete internal cross-references.',
  },
];

export default function DashboardPage() {
  return (
    <div className="min-h-screen px-6 py-12 lg:px-16 overflow-hidden">
      <div className="max-w-6xl mx-auto flex flex-col">
        
        {/* Hero Section */}
        <div className="w-full max-w-3xl mb-24 mt-8 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-neutral-800 bg-neutral-900/50 mb-8">
            <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-300">v1.0 Engine Available</span>
          </div>

          <h1 className="text-5xl md:text-6xl font-semibold mb-6 leading-tight tracking-tight text-white">
            Synthesize philosophy. <br />
            <span className="text-neutral-500">At scale.</span>
          </h1>
          
          <p className="text-neutral-400 text-lg mb-10 leading-relaxed max-w-xl font-light">
            Upload your corpus. The engine reads, plans, and writes
            a complete essay series — citation-backed, internally coherent, and
            scholarly precise.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <Link
              href="/runs/new"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-white text-black font-medium text-sm transition-all hover:bg-neutral-200 w-full sm:w-auto"
            >
              Initialize Pipeline
              <ArrowRight className="w-4 h-4" />
            </Link>
            
            <Link
              href="/runs"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-transparent text-white border border-neutral-800 hover:bg-neutral-900 font-medium text-sm transition-all w-full sm:w-auto"
            >
              View Library
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-neutral-800/50 border border-neutral-800 rounded-xl overflow-hidden mb-24 w-full">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-black p-8 flex flex-col items-start transition-colors hover:bg-neutral-900/50 group"
            >
              <div className="mb-5 text-neutral-100">
                <feature.icon className="w-5 h-5 text-current opacity-80" />
              </div>
              <h3 className="text-sm font-medium text-white mb-2 tracking-tight">
                {feature.title}
              </h3>
              <p className="text-sm text-neutral-400 leading-relaxed font-light">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Recent Runs Section */}
        <div className="w-full">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-4 mb-6">
            <h2 className="text-lg font-medium text-white">
              Recent Pipeline Runs
            </h2>
            <Link href="/runs" className="text-xs font-medium text-neutral-400 hover:text-white transition-colors flex items-center gap-1 group">
              View all
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
          
          <div className="rounded-xl border border-dashed border-neutral-800 bg-black/50 p-12 text-center">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-lg bg-neutral-900 flex items-center justify-center mb-4 border border-neutral-800">
                <BookOpen className="w-5 h-5 text-neutral-500" />
              </div>
              <h3 className="text-sm font-medium text-white mb-1">Library is empty</h3>
              <p className="text-neutral-500 text-sm mb-6 max-w-sm mx-auto font-light">
                Initialize your first run to extract knowledge and generate an essay series from your corpus.
              </p>
              <Link
                href="/runs/new"
                className="inline-flex items-center gap-2 px-4 py-2 rounded border border-neutral-800 text-white hover:bg-neutral-900 transition-all font-medium text-xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Initialize Run
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
