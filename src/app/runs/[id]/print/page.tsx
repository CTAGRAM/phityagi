import { createClient } from '@/lib/supabase/server';
import ReactMarkdown from 'react-markdown';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PrintPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: run } = await supabase.from('runs').select('*').eq('id', params.id).single();
  
  if (!run) {
    notFound();
  }

  const { data: essays } = await supabase
    .from('essays')
    .select('*')
    .eq('run_id', params.id)
    .order('essay_number', { ascending: true });

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-4xl mx-auto px-12 py-16 print:p-0">
        
        {/* Print Button (Hidden when printing) */}
        <div className="print:hidden mb-8 flex justify-end">
          <button 
            onClick={() => window.print()}
            className="px-6 py-2 bg-blue-600 text-white rounded shadow text-sm font-medium hover:bg-blue-700"
          >
            Print to PDF
          </button>
        </div>

        {/* Title Page */}
        <div className="text-center mt-32 mb-48 print:break-after-page">
          <h1 className="text-4xl md:text-5xl font-bold text-black mb-6 tracking-tight leading-tight">
            {run.target_philosophy}
          </h1>
          <p className="text-lg text-neutral-600 mb-8">
            An Exhaustive Philosophical Series
          </p>
          <div className="text-sm font-medium text-neutral-500 uppercase tracking-widest mt-24">
            Generated on {new Date(run.created_at).toLocaleDateString()}
          </div>
        </div>

        {/* Essays */}
        <div className="space-y-4">
          {essays?.map((essay: any, index: number) => (
            <div key={essay.id} className="print:break-before-page mb-24">
              <div className="mb-12">
                <p className="text-sm font-bold text-neutral-500 tracking-widest uppercase mb-4">
                  Chapter {essay.essay_number}
                </p>
                <h2 className="text-3xl font-bold text-black border-b-2 border-black pb-4">
                  {essay.title}
                </h2>
              </div>
              
              <div className="prose prose-neutral prose-lg max-w-none prose-headings:font-bold prose-h3:text-2xl prose-h4:text-xl text-black">
                <ReactMarkdown>
                  {essay.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
        </div>

      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { background: white; color: black; }
          .prose { max-width: 100% !important; }
        }
      `}} />
    </div>
  );
}
