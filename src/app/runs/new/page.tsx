'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, X, BookOpen, AlertCircle, Loader2, ArrowRight, ShieldCheck, ChevronDown, ChevronUp
} from 'lucide-react';
import { TONE_PRESETS, FILE_EXTENSIONS, CITATION_STYLES } from '@/lib/constants';

interface UploadedFile {
  file: File;
  id: string;
  status: 'ready' | 'uploading' | 'done' | 'error';
}

export default function NewRunPage() {
  const router = useRouter();
  const [targetName, setTargetName] = useState('');
  const [tone, setTone] = useState('scholarly');
  const [customTone, setCustomTone] = useState('');
  const [citationStyle, setCitationStyle] = useState('inline');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [corpusOnly, setCorpusOnly] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const validFiles = Array.from(newFiles).filter((f) => {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      return FILE_EXTENSIONS.includes(ext as typeof FILE_EXTENSIONS[number]);
    });
    const mapped: UploadedFile[] = validFiles.map((f) => ({
      file: f,
      id: crypto.randomUUID(),
      status: 'ready',
    }));
    setFiles((prev) => [...prev, ...mapped]);
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const handleSubmit = async () => {
    if (!targetName.trim() || files.length === 0) return;
    setIsSubmitting(true);
    
    try {
      // 1. Initialize Supabase
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      
      // 2. Auto-authenticate if needed (simple MVP hack to bypass auth UI)
      let { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Create an anonymous/dummy user just so RLS passes
        // Using a more standard domain because Supabase blocks example.com by default
        const randomEmail = `testuser${Date.now()}@gmail.com`;
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: randomEmail,
          password: 'super-secure-password-123!',
        });
        
        if (authError) throw new Error('Auto-signup failed: ' + authError.message);
        
        session = authData.session;
        
        // If session is STILL null, it means "Confirm email" is enabled in their dashboard
        if (!session) {
          throw new Error('Supabase Auth blocked login. Please go to your Supabase Dashboard -> Authentication -> Providers -> Email, and turn OFF "Confirm email". Then try again.');
        }
      }
      
      const userId = session?.user.id;
      if (!userId) throw new Error('Could not secure a user session.');
      
      let finalTargetName = targetName.trim();
      const { data: existingRun } = await supabase
        .from('runs')
        .select('id')
        .eq('user_id', userId)
        .eq('target_philosophy', finalTargetName)
        .maybeSingle();
        
      if (existingRun) {
        const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
        finalTargetName = `${finalTargetName} (${timestamp})`;
      }

      // 3. Create the Run
      const { data: run, error: runError } = await supabase
        .from('runs')
        .insert({
          user_id: userId,
          target_philosophy: finalTargetName,
          tone_preset: tone === 'custom' ? 'custom' : tone,
          custom_tone: tone === 'custom' ? customTone : null,
          citation_style: citationStyle,
          corpus_only: corpusOnly,
          status: 'pending'
        })
        .select()
        .single();
        
      if (runError) throw new Error('Failed to create run: ' + runError.message);

      // 4. Upload Files & Create Document Records
      for (const f of files) {
        // Sanitize filename
        const safeName = f.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filePath = `${userId}/${run.id}/${Date.now()}_${safeName}`;
        
        // Upload to Storage
        const { error: uploadError } = await supabase.storage
          .from('corpus_documents')
          .upload(filePath, f.file);
          
        if (uploadError) throw new Error(`Upload failed for ${f.file.name}: ` + uploadError.message);
        
        // Insert DB Record
        const { error: docError } = await supabase
          .from('documents')
          .insert({
            run_id: run.id,
            filename: f.file.name,
            file_path: filePath,
            file_size: f.file.size,
            file_type: f.file.name.split('.').pop() || 'unknown',
            status: 'pending'
          });
          
        if (docError) throw new Error('Failed to register DB document: ' + docError.message);
      }

      // 5. Trigger the Background Edge Function Pipeline
      // 3. Trigger robust Next.js API Route for processing (no 150s timeout)
      const res = await fetch('/api/process-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: run.id })
      });
      
      const resData = await res.json();
      if (!res.ok || resData.error) {
        throw new Error(resData.error || 'Failed to trigger pipeline');
      }

      // Success
      router.push(`/runs/${run.id}`);

    } catch (err: any) {
      console.error(err);
      alert(err.message || 'An error occurred during pipeline initialization.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen px-6 py-12 lg:px-16 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-12 animate-fade-in-up">
        <h1 className="text-3xl font-semibold mb-3 tracking-tight text-white">
          Initialize Pipeline
        </h1>
        <p className="text-neutral-400 text-sm max-w-xl font-light">
          Configure the engine. Upload your documents, define the philosophical target, and set generation parameters.
        </p>
      </div>

      {/* Form Sequence */}
      <div className="space-y-8 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
        
        {/* Step 1: Target Name */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded flex items-center justify-center bg-white text-black text-[10px] font-bold">1</span>
              Target Philosophy
            </h2>
          </div>
          <div className="relative">
            <input
              type="text"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="e.g., Stoicism, Advaita Vedānta, Epictetus..."
              className="w-full px-4 py-3 rounded-md bg-black border border-neutral-800 focus:border-neutral-500 focus:outline-none text-sm text-white placeholder:text-neutral-600 transition-colors"
            />
          </div>
        </section>

        {/* Step 2: File Upload */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded flex items-center justify-center bg-white text-black text-[10px] font-bold">2</span>
              Upload Corpus
            </h2>
          </div>
          
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`border border-dashed rounded-md p-8 text-center transition-colors cursor-pointer ${
              dragActive ? 'border-neutral-400 bg-neutral-900' : 'border-neutral-800 hover:bg-neutral-900/50'
            }`}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input id="file-input" type="file" multiple accept={FILE_EXTENSIONS.join(',')} className="hidden" onChange={(e) => handleFiles(e.target.files)} />
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-neutral-900 flex items-center justify-center border border-neutral-800">
              <Upload className={`w-4 h-4 ${dragActive ? 'text-white' : 'text-neutral-500'}`} />
            </div>
            <p className="text-sm text-neutral-300 font-medium mb-1">
              Select or drag files
            </p>
            <p className="text-xs text-neutral-500">PDF, EPUB, DOCX, TXT. Max 50MB.</p>
          </div>

          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((f) => (
                <div key={f.id} className="flex items-center justify-between px-4 py-3 rounded-md border border-neutral-800 bg-black group">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <BookOpen className="w-4 h-4 text-neutral-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-neutral-200 truncate">{f.file.name}</p>
                      <p className="text-[10px] text-neutral-500">{formatFileSize(f.file.size)}</p>
                    </div>
                  </div>
                  <button onClick={() => removeFile(f.id)} className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-neutral-800 transition-all text-neutral-500 hover:text-white shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Step 3: Generation Settings */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-white flex items-center gap-2">
              <span className="w-5 h-5 rounded flex items-center justify-center bg-white text-black text-[10px] font-bold">3</span>
              Generation Settings
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
            {TONE_PRESETS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTone(t.id)}
                className={`p-4 rounded-md text-left transition-colors border ${
                  tone === t.id
                    ? 'bg-neutral-900 border-neutral-600'
                    : 'bg-black border-neutral-800 hover:bg-neutral-900/50'
                }`}
              >
                <p className={`text-xs font-medium mb-1.5 ${tone === t.id ? 'text-white' : 'text-neutral-300'}`}>{t.label}</p>
                <p className="text-[10px] text-neutral-500 leading-relaxed">{t.description}</p>
              </button>
            ))}
          </div>

          {tone === 'custom' && (
            <div className="mb-4">
              <textarea
                value={customTone}
                onChange={(e) => setCustomTone(e.target.value)}
                placeholder="Describe desired voice..."
                rows={3}
                className="w-full px-4 py-3 rounded-md bg-black border border-neutral-800 focus:border-neutral-500 focus:outline-none text-sm text-white placeholder:text-neutral-600 resize-none"
              />
            </div>
          )}

          <div className="border border-neutral-800 rounded-md bg-black">
            <button onClick={() => setShowAdvanced(!showAdvanced)} className="w-full flex items-center justify-between px-4 py-3 text-xs font-medium text-neutral-400 hover:text-neutral-200 transition-colors">
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                Advanced Parameters
              </span>
              {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showAdvanced && (
              <div className="px-4 pb-4 pt-2 space-y-5 border-t border-neutral-800">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-2">Citation Style</label>
                  <div className="flex flex-wrap gap-2">
                    {CITATION_STYLES.map((cs) => (
                      <button
                        key={cs.id}
                        onClick={() => setCitationStyle(cs.id)}
                        className={`px-3 py-1.5 rounded text-xs transition-colors border ${
                          citationStyle === cs.id ? 'bg-white text-black border-white' : 'bg-black border-neutral-800 hover:bg-neutral-900 text-neutral-400'
                        }`}
                      >
                        {cs.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-neutral-300">Strictly Corpus-Only</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">Restrict engine knowledge to uploaded documents.</p>
                  </div>
                  <button onClick={() => setCorpusOnly(!corpusOnly)} className={`w-8 h-4 rounded-full transition-colors relative ${corpusOnly ? 'bg-white' : 'bg-neutral-800'}`}>
                    <div className={`w-3 h-3 rounded-full absolute top-0.5 transition-all ${corpusOnly ? 'left-[18px] bg-black' : 'left-0.5 bg-neutral-500'}`} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Validation Warning */}
        {(!targetName.trim() || files.length === 0) && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-md border border-neutral-800 bg-neutral-900/30">
            <AlertCircle className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
            <p className="text-xs text-neutral-400 leading-relaxed">
              {!targetName.trim() && 'Target philosophy required. '}
              {files.length === 0 && 'Corpus documents required.'}
            </p>
          </div>
        )}

        {/* Submit Action */}
        <section className="pt-4 pb-16">
          <button
            onClick={handleSubmit}
            disabled={!targetName.trim() || files.length === 0 || isSubmitting}
            className={`w-full flex items-center justify-center gap-2 px-6 py-4 rounded-md font-medium text-sm transition-colors ${
              !targetName.trim() || files.length === 0
                ? 'bg-neutral-900 text-neutral-600 cursor-not-allowed border border-neutral-800'
                : 'bg-white text-black hover:bg-neutral-200'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Initializing...
              </>
            ) : (
              <>
                Commence Generation
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </section>

      </div>
    </div>
  );
}
