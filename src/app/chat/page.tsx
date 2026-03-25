'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, BookOpen, Sparkles, User, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: { content: string; similarity: number }[];
  sourceCount?: number;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSources, setShowSources] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase.functions.invoke('chat-rag', {
        body: { question, userId: user?.id },
      });

      if (error) throw error;

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer || 'No answer generated.',
          sources: data.sources,
          sourceCount: data.sourceCount,
        },
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Error: ${err.message || 'Something went wrong. Please try again.'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="shrink-0 border-b border-neutral-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Corpus Chat</h1>
            <p className="text-xs text-neutral-500">RAG-powered Q&A across your philosophical corpus</p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-6">
              <BookOpen className="w-8 h-8 text-neutral-600" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Ask your corpus anything</h2>
            <p className="text-neutral-500 text-sm max-w-md mb-8">
              Your questions are answered using semantic search across all uploaded documents and generated essays. 
              Responses include citations traced to source material.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
              {[
                'What are the six padarthas in Vaisheshika?',
                'Explain the concept of dravya',
                'How does Prasastapada define samanya?',
                'What is the relation between guna and dravya?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="text-left p-3 rounded-lg border border-neutral-800 bg-neutral-900/50 text-sm text-neutral-400 hover:text-white hover:border-neutral-700 hover:bg-neutral-800/50 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-1">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div
                  className={`max-w-[80%] ${
                    msg.role === 'user'
                      ? 'bg-white text-black rounded-2xl rounded-tr-md px-4 py-3'
                      : 'bg-neutral-900 border border-neutral-800 rounded-2xl rounded-tl-md px-5 py-4'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="text-sm">{msg.content}</p>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none
                      prose-p:text-neutral-300 prose-p:leading-relaxed
                      prose-strong:text-white
                      prose-em:text-violet-300
                      prose-headings:text-white prose-headings:font-semibold
                      prose-blockquote:border-violet-500/50 prose-blockquote:text-neutral-400
                      prose-code:text-violet-300 prose-code:bg-neutral-800 prose-code:px-1 prose-code:rounded
                      prose-li:text-neutral-300
                      prose-a:text-violet-400">
                      <ReactMarkdown
                        remarkPlugins={[remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}

                  {/* Source citations */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-neutral-800">
                      <button
                        onClick={() => setShowSources(showSources === i ? null : i)}
                        className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
                      >
                        <BookOpen className="w-3 h-3" />
                        {msg.sourceCount} sources cited
                        <ChevronDown className={`w-3 h-3 transition-transform ${showSources === i ? 'rotate-180' : ''}`} />
                      </button>
                      {showSources === i && (
                        <div className="mt-2 space-y-2">
                          {msg.sources.map((src, j) => (
                            <div key={j} className="p-2.5 bg-neutral-800/50 rounded-lg text-xs text-neutral-400 border border-neutral-800">
                              <span className="text-violet-400 font-medium">[Source {j + 1}]</span>{' '}
                              <span className="text-neutral-500">({(src.similarity * 100).toFixed(0)}% match)</span>
                              <p className="mt-1 line-clamp-3">{src.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0 mt-1">
                    <User className="w-3.5 h-3.5 text-neutral-400" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl rounded-tl-md px-5 py-4">
                  <div className="flex items-center gap-2 text-sm text-neutral-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Searching corpus & generating answer...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="shrink-0 border-t border-neutral-800 px-6 py-4">
        <form onSubmit={handleSend} className="max-w-3xl mx-auto">
          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your philosophical texts..."
              disabled={loading}
              className="w-full px-4 py-3 pr-12 bg-neutral-900 border border-neutral-800 rounded-xl text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-neutral-700 transition-all text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="absolute right-2 p-2 rounded-lg bg-violet-600 text-white hover:bg-violet-500 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-center text-xs text-neutral-600 mt-2">
            Answers are generated from your uploaded corpus using RAG (Retrieval-Augmented Generation)
          </p>
        </form>
      </div>
    </div>
  );
}
