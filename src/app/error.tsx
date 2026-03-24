'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Error Caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center font-sans">
      <div className="max-w-md w-full border border-neutral-800 bg-neutral-900/50 rounded-xl p-8 shadow-2xl">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-3">System Error</h1>
        <p className="text-neutral-400 text-sm mb-8 leading-relaxed">
          The Philosophy Series Engine encountered an unexpected error. Our pipeline has halted parsing for safety.
          <br /><br />
          <span className="font-mono text-xs bg-black px-2 py-1 rounded text-red-400 border border-neutral-800 flex overflow-x-auto text-left">
            {error.message || "An unknown routing/render error occurred."}
          </span>
        </p>
        <button
          onClick={() => reset()}
          className="w-full flex items-center justify-center gap-2 bg-white text-black font-semibold py-3 px-4 rounded-lg hover:bg-neutral-200 transition-colors"
        >
          <RefreshCcw className="w-4 h-4" />
          Reboot Interface
        </button>
      </div>
    </div>
  );
}
