'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, BookOpen, Sparkles, User, ChevronDown, Trash2, Plus, MessageSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: { content: string; similarity: number; book_name?: string }[];
  sourceCount?: number;
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  messages: Message[];
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSources, setShowSources] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load overall sessions
  useEffect(() => {
    const saved = localStorage.getItem('philosophy-engine-chat-sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setSessions(parsed);
          if (parsed.length > 0 && !currentSessionId) {
            setCurrentSessionId(parsed[0].id);
          }
        }
      } catch (e) {
        console.error('Failed to parse chat history', e);
      }
    }
  }, []);

  // Sync sessions to localStorage
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem('philosophy-engine-chat-sessions', JSON.stringify(sessions));
    } else {
      localStorage.removeItem('philosophy-engine-chat-sessions');
    }
  }, [sessions]);

  const currentSession = sessions.find(s => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setInput('');
    setShowSources(null);
  };

  const handleDeleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this chat session?')) {
      setSessions(prev => {
        const updated = prev.filter(s => s.id !== id);
        if (currentSessionId === id) {
          setCurrentSessionId(updated.length > 0 ? updated[0].id : null);
        }
        return updated;
      });
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput('');
    setLoading(true);

    let activeSessionId = currentSessionId;

    // Create a new session if we are in a fresh screen
    if (!activeSessionId) {
      activeSessionId = crypto.randomUUID();
      const newSession: ChatSession = {
        id: activeSessionId,
        title: question.length > 30 ? question.slice(0, 30) + '...' : question,
        updatedAt: Date.now(),
        messages: [{ role: 'user' as const, content: question }]
      };
      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(activeSessionId);
    } else {
      // Append strictly to existing session
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            updatedAt: Date.now(),
            messages: [...s.messages, { role: 'user' as const, content: question }]
          };
        }
        return s;
      }).sort((a, b) => b.updatedAt - a.updatedAt));
    }

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase.functions.invoke('chat-rag', {
        body: { question, userId: user?.id },
      });

      if (error) throw error;

      // Update session with AI response
      setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
          return {
            ...s,
            updatedAt: Date.now(),
            messages: [
              ...s.messages, 
              { 
                role: 'assistant' as const, 
                content: data.answer || 'No answer generated.', 
                sources: data.sources, 
                sourceCount: data.sourceCount 
              }
            ]
          };
        }
        return s;
      }));
    } catch (err: any) {
       setSessions(prev => prev.map(s => {
        if (s.id === activeSessionId) {
           return {
             ...s,
             messages: [
               ...s.messages, 
               { role: 'assistant' as const, content: `Error: ${err.message || 'Something went wrong.'}` }
             ]
           };
        }
        return s;
       }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-black overflow-hidden">
      
      {/* Sidebar: Chat Sessions */}
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
        
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {sessions.length === 0 ? (
             <div className="text-center mt-10">
               <MessageSquare className="w-6 h-6 text-neutral-600 mx-auto mb-2 opacity-50" />
               <p className="text-xs text-neutral-500">No chat history</p>
             </div>
          ) : (
             sessions.map(s => (
              <div key={s.id} className="relative group">
                <button 
                  onClick={() => setCurrentSessionId(s.id)}
                  className={`w-full flex items-center gap-3 text-left px-3 py-3 rounded-lg text-sm transition-all ${
                    currentSessionId === s.id 
                    ? 'bg-neutral-800 text-white shadow-sm' 
                    : 'text-neutral-400 hover:bg-neutral-900/80 hover:text-neutral-200'
                  }`}
                >
                  <MessageSquare className={`w-4 h-4 shrink-0 ${currentSessionId === s.id ? 'text-violet-400' : 'text-neutral-500'}`} />
                  <span className="truncate pr-6 text-[13px]">{s.title}</span>
                </button>
                <button 
                  onClick={(e) => handleDeleteSession(e, s.id)}
                  className="absolute right-2 top-[10px] p-1.5 rounded-md text-neutral-500 hover:text-red-400 hover:bg-neutral-800 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
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
              <h1 className="text-lg font-semibold text-white">GNOSIS Chat</h1>
              <p className="text-xs text-neutral-500">Semantic search across 12 intellectual domains — philosophy, religion, science, psychology & more</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {(!currentSessionId && messages.length === 0) ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-6">
                <BookOpen className="w-8 h-8 text-neutral-600" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Ask across your entire library</h2>
              <p className="text-neutral-500 text-sm max-w-md mb-8">
                Semantic search runs across all domains — philosophy, religion, literature, history, science, law, economics, art, language, psychology, politics, and technology. Cross-domain connections are surfaced automatically.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                {[
                  'How does Stoic philosophy relate to cognitive behavioral psychology?',
                  'Compare economic theories of Adam Smith with Kautilya\'s Arthashastra',
                  'What are the six padarthas in Vaisheshika?',
                  'How does quantum mechanics challenge classical determinism in philosophy?',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="text-left p-3 rounded-lg border border-neutral-800 bg-neutral-900/50 text-sm text-neutral-400 hover:text-white hover:border-neutral-700 hover:bg-neutral-800/50 transition-all line-clamp-2"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6 pb-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role === 'assistant' && (
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
                      <div className="mt-5 pt-4 border-t border-neutral-800/80">
                        <button
                          onClick={() => setShowSources(showSources === i ? null : i)}
                          className="flex items-center gap-2 text-[13px] font-medium text-neutral-500 hover:text-neutral-300 transition-colors group"
                        >
                          <BookOpen className="w-3.5 h-3.5 group-hover:text-violet-400 transition-colors" />
                          {msg.sourceCount} sources cited
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showSources === i ? 'rotate-180' : ''}`} />
                        </button>
                        
                        <div className={`grid transition-all duration-300 ease-in-out ${showSources === i ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0 mt-0'}`}>
                          <div className="overflow-hidden space-y-2.5">
                            {msg.sources.map((src: any, j: number) => (
                              <div key={j} className="p-3 bg-neutral-950/50 rounded-lg text-[13px] text-neutral-400 border border-neutral-800/80 hover:border-neutral-700 transition-colors">
                                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                  <span className="text-violet-400 font-medium px-1.5 py-0.5 rounded bg-violet-950/30 border border-violet-900/30">[Source {j + 1}]</span>
                                  <span className="text-neutral-300 font-semibold uppercase tracking-wider text-[11px] bg-neutral-800/50 px-2 py-0.5 rounded">
                                    {src.book_name || 'Philosophy Engine'}
                                  </span>
                                  <span className="text-neutral-500 text-[11px]">({(src.similarity * 100).toFixed(0)}% relevant)</span>
                                </div>
                                <p className="leading-relaxed line-clamp-3 pl-1 border-l border-neutral-800 ml-1 italic">{src.content}</p>
                              </div>
                            ))}
                          </div>
                        </div>
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

              {loading && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-1 shadow-md">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl rounded-tl-sm px-6 py-4 shadow-sm animate-pulse">
                    <div className="flex items-center gap-3 text-sm text-neutral-400 font-medium tracking-wide">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                      Analyzing corpus layers & generating synthesis...
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
          <form onSubmit={handleSend} className="max-w-4xl mx-auto relative">
            <div className="relative flex items-end bg-neutral-900 border border-neutral-800 rounded-2xl shadow-lg focus-within:ring-1 focus-within:ring-violet-500/50 focus-within:border-violet-500/50 transition-all overflow-hidden">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e as any);
                  }
                }}
                placeholder="Ask about your philosophical texts (e.g., 'Compare the concept of Dharma across books')..."
                disabled={loading}
                className="w-full max-h-48 min-h-[56px] px-5 py-4 resize-none bg-transparent text-white placeholder-neutral-500 focus:outline-none text-[15px] leading-relaxed disabled:opacity-50"
                rows={1}
                style={{ height: input ? 'auto' : '56px' }}
              />
              <div className="p-2 shrink-0">
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="p-2 rounded-xl bg-violet-600 text-white hover:bg-violet-500 hover:shadow-lg hover:shadow-violet-500/20 transition-all disabled:opacity-30 disabled:hover:shadow-none disabled:cursor-not-allowed flex items-center justify-center h-10 w-10"
                >
                  <Send className="w-4 h-4 translate-x-px" />
                </button>
              </div>
            </div>
            {/* Action Bar */}
            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                onClick={async () => {
                   if (!input.trim() || loading) return;
                   const topic = input.trim();
                   setInput('');
                   setLoading(true);
                   
                   try {
                     const res = await fetch('http://127.0.0.1:8000/api/v1/research_topic', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ topic, run_id: currentSessionId || 'chat_session' })
                     });
                     const data = await res.json();
                     
                     if (!res.ok) throw new Error(data.detail || 'Research failed');
                     
                     const answerText = `**GNOSIS Drill Deeper Research Results on "${data.topic}"**:\n\n${data.answer}\n\n*Sources:* ${data.sources.map((s:any) => `[${s.title}](${s.url})`).join(', ')}`;
                     
                     setSessions(prev => prev.map(s => {
                       if (s.id === currentSessionId) {
                         return { ...s, messages: [...s.messages,
                            { role: 'user', content: `/research ${topic}` },
                            { role: 'assistant', content: answerText }
                         ]};
                       }
                       return s;
                     }));
                   } catch (e: any) {
                     alert("Research Error: " + e.message);
                   } finally {
                     setLoading(false);
                   }
                }}
                disabled={loading || !input.trim() || !currentSessionId}
                className="text-[11px] font-medium text-neutral-400 hover:text-violet-400 border border-neutral-800 hover:border-violet-500/30 bg-neutral-900/50 px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-3 h-3" />
                Drill Deeper (Live Web Research)
              </button>
              <p className="text-[11px] font-medium text-neutral-500 tracking-wide flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-violet-400/70" />
                Semantic traceability guaranteed.
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
