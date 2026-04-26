'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { Send, Loader2, BookOpen, Sparkles, User, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

export default function ChatPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>('');

  useEffect(() => {
    const fetchRuns = async () => {
      const supabase = createClient();
      const { data } = await supabase.from('runs').select('id, target_philosophy, domain_tag, domain_tags').order('created_at', { ascending: false });
      if (data) {
        setRuns(data);
        if (data.length > 0) setSelectedRunId(data[0].id);
      }
    };
    fetchRuns();
  }, []);

  const { messages, input, handleInputChange, handleSubmit, isLoading, setMessages } = useChat({
    body: {
      runId: selectedRunId
    }
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNewChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex h-screen bg-black overflow-hidden">
      
      {/* Sidebar */}
      <div className="w-64 border-r border-neutral-800 bg-neutral-950/50 flex flex-col shrink-0">
        <div className="p-4 border-b border-neutral-800 shrink-0">
          <button 
            onClick={handleNewChat}
            className="w-full py-2.5 px-4 rounded-lg bg-violet-600 text-white flex items-center justify-center gap-2 text-sm font-medium hover:bg-violet-500 transition-colors shadow-lg shadow-violet-500/10"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>
        
        <div className="p-4 border-b border-neutral-800 shrink-0">
          <label className="block text-xs text-neutral-400 mb-2">Select Target Book / Knowledge Base</label>
          <select 
            value={selectedRunId}
            onChange={(e) => setSelectedRunId(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-800 text-white text-sm rounded-lg focus:ring-violet-500 focus:border-violet-500 block p-2.5"
          >
            <option value="">Global (No specific book)</option>
            {runs.map(run => (
              <option key={run.id} value={run.id}>{run.target_philosophy}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
           <div className="text-sm text-neutral-400">
             <BookOpen className="w-4 h-4 inline mr-2 text-violet-400"/>
             Context bound to selected book.
           </div>
           <div className="text-sm text-neutral-400">
             <Sparkles className="w-4 h-4 inline mr-2 text-violet-400"/>
             Agent automatically executes tools for RAG and Web Search.
           </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="shrink-0 border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">GNOSIS Agentic Chat</h1>
              <p className="text-xs text-neutral-500">Autonomous tool execution (RAG + Research) across intellectual domains.</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-6">
                <BookOpen className="w-8 h-8 text-neutral-600" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Ask GNOSIS anything</h2>
              <p className="text-neutral-500 text-sm max-w-md mb-8">
                The agent will automatically decide whether to search your corpus or perform live web research.
              </p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6 pb-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role !== 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-1 shadow-md">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] ${
                      msg.role === 'user'
                        ? 'bg-neutral-100 text-black rounded-2xl rounded-tr-sm px-5 py-3.5 shadow-sm'
                        : 'bg-neutral-900 border border-neutral-800 rounded-2xl rounded-tl-sm px-6 py-5 shadow-sm'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="text-[15px] leading-relaxed">{msg.content}</p>
                    ) : (
                      <div className="prose prose-invert prose-base max-w-none
                        prose-p:text-neutral-300 prose-p:leading-relaxed
                        prose-strong:text-white prose-strong:font-semibold
                        prose-em:text-violet-300
                        prose-headings:text-white prose-headings:font-semibold prose-headings:mt-6 prose-headings:mb-3
                        prose-h3:text-lg prose-h4:text-base
                        prose-blockquote:border-l-2 prose-blockquote:border-violet-500/50 prose-blockquote:text-neutral-400 prose-blockquote:bg-neutral-800/30 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r
                        prose-code:text-violet-300 prose-code:bg-neutral-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-[13px]
                        prose-pre:bg-neutral-950 prose-pre:border prose-pre:border-neutral-800
                        prose-li:text-neutral-300 prose-ul:my-4 prose-ol:my-4
                        prose-a:text-violet-400 hover:prose-a:text-violet-300 transition-colors">
                        {msg.content.length > 0 ? (
                           <ReactMarkdown
                             remarkPlugins={[remarkMath]}
                             rehypePlugins={[rehypeKatex]}
                           >
                             {msg.content}
                           </ReactMarkdown>
                        ) : null}

                        {/* Render tool invocations */}
                        {msg.toolInvocations?.map((toolInvocation, idx) => {
                          if ('result' in toolInvocation) {
                            return (
                              <div key={idx} className="mt-4 p-3 bg-neutral-950 rounded border border-neutral-800 text-xs text-neutral-400 font-mono">
                                <div className="text-green-400 mb-1">✓ Executed {toolInvocation.toolName}</div>
                                <div className="truncate opacity-50">{JSON.stringify(toolInvocation.args)}</div>
                              </div>
                            );
                          }
                          return (
                            <div key={idx} className="mt-4 p-3 bg-neutral-950 rounded border border-neutral-800 text-xs text-neutral-400 font-mono flex items-center gap-2">
                              <Loader2 className="w-3 h-3 animate-spin text-violet-400"/> Executing {toolInvocation.toolName}...
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                      <User className="w-4 h-4 text-neutral-400" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-1 shadow-md">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl rounded-tl-sm px-6 py-4 shadow-sm animate-pulse">
                    <div className="flex items-center gap-3 text-sm text-neutral-400 font-medium tracking-wide">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                      GNOSIS is thinking...
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="shrink-0 border-t border-neutral-800 p-4 bg-black/80 backdrop-blur-sm z-10">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
            <div className="relative flex items-end bg-neutral-900 border border-neutral-800 rounded-2xl shadow-lg focus-within:ring-1 focus-within:ring-violet-500/50 focus-within:border-violet-500/50 transition-all overflow-hidden">
              <textarea
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                  }
                }}
                placeholder="Ask GNOSIS..."
                disabled={isLoading}
                className="w-full max-h-48 min-h-[56px] px-5 py-4 resize-none bg-transparent text-white placeholder-neutral-500 focus:outline-none text-[15px] leading-relaxed disabled:opacity-50"
                rows={1}
                style={{ height: input ? 'auto' : '56px' }}
              />
              <div className="p-2 shrink-0">
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="p-2 rounded-xl bg-violet-600 text-white hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/20 transition-all disabled:opacity-30 disabled:hover:shadow-none disabled:cursor-not-allowed flex items-center justify-center h-10 w-10"
                >
                  <Send className="w-4 h-4 translate-x-px" />
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
