import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Plus, Bookmark, Check, Pin, Trash2, History, X, Copy, Mic, Square, Share2, FileDown, ChevronRight } from 'lucide-react';
import { useNavigate, useParams, useLocation, NavLink, Link } from 'react-router-dom';
import { supabase, ChatMessage } from '../lib/supabase';
import { generateResponseStream } from '../lib/llm';
import { Courthouse, Logo } from './Art';
import { Answer } from './Answer';
import { ArticleDrawer } from './ArticleDrawer';
import { splitAnswer } from '../lib/answer';
import { LANGS, SPEECH_LANG, FALLBACK_FOLLOWUPS, getLang, saveLang, type Lang } from '../lib/lang';
import { exportPdf, canShare, shareAnswer } from '../lib/export';
import { guides } from '../lib/rights';

type Convo = { session_id: string; title: string; created_at: string; pinned: boolean };

// Fallback storage for pins, used only if the `pinned_chats` table is missing/blocked in Supabase.
const LOCAL_PINS_KEY = 'lawsage_pinned_chats';
const getLocalPins = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(LOCAL_PINS_KEY) || '[]'));
  } catch {
    return new Set();
  }
};
const setLocalPins = (pins: Set<string>) => {
  try {
    localStorage.setItem(LOCAL_PINS_KEY, JSON.stringify([...pins]));
  } catch {
    /* ignore */
  }
};

export const Chat = () => {
  const { sessionId: sessionParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [sessionId, setSessionId] = useState<string>(() => sessionParam || crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(getLang);
  const [followups, setFollowups] = useState<string[]>([]);
  const [articleKey, setArticleKey] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const autoRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const SpeechRec = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

  const loadConvos = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('session_id, content, created_at')
      .eq('role', 'user')
      .order('created_at', { ascending: true })
      .limit(1000);
    const { data: pins, error: pinsError } = await supabase.from('pinned_chats').select('session_id');
    // If the table doesn't exist (404) or is blocked, fall back to local pins so the UI still works.
    const pinned = pinsError
      ? getLocalPins()
      : new Set((pins || []).map((p: { session_id: string }) => p.session_id));
    const map = new Map<string, Convo>();
    (data || []).forEach((r: { session_id: string; content: string; created_at: string }) => {
      if (!map.has(r.session_id)) map.set(r.session_id, { session_id: r.session_id, title: r.content, created_at: r.created_at, pinned: pinned.has(r.session_id) });
    });
    setConvos([...map.values()].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at)));
  }, []);

  useEffect(() => {
    loadConvos();
  }, [loadConvos]);

  // Open an old conversation (/chat/:id) or start a fresh one (/chat)
  useEffect(() => {
    setFollowups([]);
    if (!sessionParam) {
      setSessionId(crypto.randomUUID());
      setMessages([]);
      return;
    }
    setSessionId(sessionParam);
    (async () => {
      const { data } = await supabase
        .from('messages')
        .select('id, content, role, created_at, session_id')
        .eq('session_id', sessionParam)
        .order('created_at', { ascending: true });
      setMessages((data as ChatMessage[]) || []);
    })();
  }, [sessionParam, location.key]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const togglePin = async (c: Convo) => {
    const { error } = c.pinned
      ? await supabase.from('pinned_chats').delete().eq('session_id', c.session_id)
      : await supabase.from('pinned_chats').insert({ session_id: c.session_id });
    if (error) {
      console.error('Pin failed (using local fallback):', error);
      const local = getLocalPins();
      if (c.pinned) local.delete(c.session_id);
      else local.add(c.session_id);
      setLocalPins(local);
    }
    loadConvos();
  };

  const deleteChat = async (c: Convo) => {
    if (!window.confirm('Delete this chat? This cannot be undone.')) return;
    const { error } = await supabase.from('messages').delete().eq('session_id', c.session_id);
    if (error) return console.error('Delete failed:', error);
    await supabase.from('pinned_chats').delete().eq('session_id', c.session_id);
    const local = getLocalPins();
    if (local.delete(c.session_id)) setLocalPins(local);
    if (c.session_id === sessionId) navigate('/chat');
    loadConvos();
  };

  const saveAnswer = async (index: number) => {
    const answer = messages[index];
    const question = [...messages.slice(0, index)].reverse().find((m) => m.role === 'user')?.content ?? null;
    const { error } = await supabase.from('saved_responses').insert({ question, answer: answer.content, session_id: answer.session_id });
    if (error) console.error('Save failed:', error);
    else setSaved((prev) => new Set(prev).add(answer.id));
  };

  const submit = async (text: string) => {
    if (!text.trim() || loading) return;

    recRef.current?.stop();
    const userMessage = text.trim();
    setInput('');
    setFollowups([]);
    setLoading(true);

    const newUserMessage: ChatMessage = {
      id: crypto.randomUUID(),
      content: userMessage,
      role: 'user',
      created_at: new Date().toISOString(),
      session_id: sessionId,
    };
    setMessages((prev) => [...prev, newUserMessage]);

    const aiId = crypto.randomUUID();
    try {
      setMessages((prev) => [
        ...prev,
        { id: aiId, content: '', role: 'assistant', created_at: new Date().toISOString(), session_id: sessionId },
      ]);

      const raw = await generateResponseStream(
        userMessage,
        (partial) => {
          const { text: shown } = splitAnswer(partial);
          setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, content: shown } : m)));
        },
        lang
      );
      const { text: finalText, followups: fu } = splitAnswer(raw);
      setFollowups(fu.length ? fu : FALLBACK_FOLLOWUPS[lang]);

      const aiMessage: ChatMessage = {
        id: aiId,
        content: finalText,
        role: 'assistant',
        created_at: new Date(Date.now() + 1).toISOString(),
        session_id: sessionId,
      };
      setMessages((prev) => prev.map((m) => (m.id === aiId ? aiMessage : m)));

      const { error } = await supabase.from('messages').insert([newUserMessage, aiMessage]);
      if (error) console.error('Could not save messages:', error);
      else {
        loadConvos();
        // make the URL point at this conversation without remounting (so a refresh keeps it)
        if (!sessionParam) window.history.replaceState(null, '', `/chat/${sessionId}`);
      }
    } catch (error) {
      console.error('Error:', error);
      const msg = error instanceof Error ? error.message : 'Please try again.';
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== aiId);
        return [
          ...without,
          { id: crypto.randomUUID(), content: `Sorry, something went wrong: ${msg}`, role: 'assistant' as const, created_at: new Date().toISOString(), session_id: sessionId },
        ];
      });
    } finally {
      setLoading(false);
    }
  };

  // A guide on the Know your rights page can open Chat with a ready question
  useEffect(() => {
    const prompt = (location.state as { prompt?: string } | null)?.prompt;
    if (prompt && autoRef.current !== location.key) {
      autoRef.current = location.key;
      submit(prompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  useEffect(() => () => recRef.current?.stop(), []);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    submit(input);
  };

  const pickLang = (l: Lang) => {
    setLang(l);
    saveLang(l);
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    if (!SpeechRec) return;
    const rec = new SpeechRec();
    rec.lang = SPEECH_LANG[lang];
    rec.interimResults = true;
    rec.continuous = false;
    const base = input ? input.trimEnd() + ' ' : '';
    rec.onresult = (e: any) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setInput(base + t);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const questionFor = (index: number) => [...messages.slice(0, index)].reverse().find((m) => m.role === 'user')?.content ?? null;

  const copyAnswer = async (m: ChatMessage) => {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopied(m.id);
      setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  const pinnedList = convos.filter((c) => c.pinned);
  const recentList = convos.filter((c) => !c.pinned);
  const lastIndex = messages.length - 1;
  const actionBtn = 'flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-ink-800';

  const row = (c: Convo) => (
    <div
      key={c.session_id}
      className={`group flex items-center rounded-lg mb-0.5 border-l-2 ${
        c.session_id === sessionId ? 'bg-brass-500/10 border-brass-500 text-ink-900' : 'border-transparent text-slate-700 hover:bg-slate-100'
      }`}
    >
      <NavLink to={`/chat/${c.session_id}`} onClick={() => setShowHistory(false)} className="flex-1 min-w-0 truncate pl-3 pr-1 py-2 text-sm" title={c.title}>
        {c.title}
      </NavLink>
      <button
        onClick={() => togglePin(c)}
        aria-label={c.pinned ? 'Unpin chat' : 'Pin chat'}
        className={`p-1.5 rounded ${c.pinned ? 'text-brass-600' : 'text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100'} hover:text-brass-700`}
      >
        <Pin className={`w-4 h-4 ${c.pinned ? 'fill-current' : ''}`} />
      </button>
      <button
        onClick={() => deleteChat(c)}
        aria-label="Delete chat"
        className="p-1.5 mr-1 rounded text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100 hover:text-red-600"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="relative flex h-full">
      {showHistory && <div className="fixed inset-0 z-10 bg-ink-950/40 md:hidden" onClick={() => setShowHistory(false)} aria-hidden />}
      {articleKey && <ArticleDrawer refKey={articleKey} onClose={() => setArticleKey(null)} />}

      {/* History */}
      <aside
        className={`${showHistory ? 'flex' : 'hidden'} md:flex absolute md:static inset-y-0 left-0 z-20 w-72 flex-col border-r border-line bg-white shadow-lift md:shadow-none`}
      >
        <div className="p-3 flex items-center gap-2">
          <button
            onClick={() => { navigate('/chat'); setShowHistory(false); }}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-ink-800 px-3 py-2.5 text-sm font-semibold text-white hover:bg-ink-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New chat
          </button>
          <button onClick={() => setShowHistory(false)} className="md:hidden p-2 text-slate-500" aria-label="Close history">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {convos.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Your conversations will appear here.</p>}
          {pinnedList.length > 0 && <p className="px-3 pt-2 pb-1 text-xs font-medium text-slate-500">Pinned</p>}
          {pinnedList.map(row)}
          {recentList.length > 0 && pinnedList.length > 0 && <p className="px-3 pt-3 pb-1 text-xs font-medium text-slate-500">Recent</p>}
          {recentList.map(row)}
        </div>
      </aside>

      {/* Conversation */}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-line bg-white">
          <button onClick={() => setShowHistory(true)} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-slate-100">
            <History className="w-4 h-4" /> History
          </button>
          <button onClick={() => navigate('/chat')} className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-800 hover:bg-slate-100">
            <Plus className="w-4 h-4" /> New
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="min-h-full flex flex-col items-center justify-center px-4 sm:px-5 py-8 text-center">
              <Courthouse tone="light" className="w-40 sm:w-52 h-auto mb-5" />
              <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-ink-900">What would you like to know?</h2>
              <p className="mt-2 text-slate-600 max-w-md">Ask about Indian laws, procedures or your rights. Every Article in an answer opens its official text.</p>
              <div className="mt-7 grid sm:grid-cols-2 gap-3 w-full max-w-2xl text-left">
                {guides.slice(0, 4).map((g) => (
                  <button
                    key={g.id}
                    onClick={() => submit(g.prompt)}
                    disabled={loading}
                    className="flex items-start gap-3 rounded-xl border border-line bg-white p-4 shadow-card hover:border-brass-400 transition-colors disabled:opacity-60"
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-800 text-brass-400">
                      <g.icon className="w-[18px] h-[18px]" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold text-ink-900">{g.title}</span>
                      <span className="block mt-0.5 text-[13.5px] leading-snug text-slate-600">{g.summary}</span>
                    </span>
                  </button>
                ))}
              </div>
              <Link to="/rights" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brass-700 hover:text-brass-600">
                See all rights guides <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full px-3 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-7">
              {messages.map((message, i) => {
                const isUser = message.role === 'user';
                const waiting = !isUser && loading && !message.content && i === lastIndex;
                const failed = message.content.startsWith('Sorry, something went wrong');
                return (
                  <div key={message.id} className={`flex gap-2.5 sm:gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && <Logo className="w-8 h-8 shrink-0 mt-0.5 hidden sm:block" />}
                    <div className={`min-w-0 ${isUser ? 'max-w-[88%] sm:max-w-[85%]' : 'flex-1'}`}>
                      {isUser ? (
                        <div className="rounded-2xl rounded-br-md bg-ink-800 px-4 py-3 shadow-card">
                          <Answer text={message.content} invert />
                        </div>
                      ) : (
                        <div className={`rounded-2xl rounded-tl-md border bg-white px-4 sm:px-5 py-4 shadow-card ${failed ? 'border-red-200' : 'border-line'}`}>
                          {waiting ? (
                            <div className="flex items-center gap-1.5 py-1" aria-label="Lawsage is thinking">
                              {[0, 1, 2].map((d) => (
                                <span key={d} className="typing-dot h-2 w-2 rounded-full bg-brass-500" style={{ animationDelay: `${d * 0.18}s` }} />
                              ))}
                            </div>
                          ) : (
                            <div className={failed ? 'text-red-700' : ''}>
                              <Answer text={message.content} onArticle={failed || (loading && i === lastIndex) ? undefined : setArticleKey} />
                            </div>
                          )}
                          {!loading && !failed && message.content && (
                            <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center gap-x-4 gap-y-2">
                              <button onClick={() => saveAnswer(i)} disabled={saved.has(message.id)} className={`${actionBtn} disabled:text-emerald-600`}>
                                {saved.has(message.id) ? <Check className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                                {saved.has(message.id) ? 'Saved' : 'Save'}
                              </button>
                              <button onClick={() => copyAnswer(message)} className={actionBtn}>
                                {copied === message.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied === message.id ? 'Copied' : 'Copy'}
                              </button>
                              <button onClick={() => exportPdf(questionFor(i), message.content)} className={actionBtn}>
                                <FileDown className="w-3.5 h-3.5" /> PDF
                              </button>
                              {canShare() && (
                                <button onClick={() => shareAnswer(questionFor(i), message.content)} className={actionBtn}>
                                  <Share2 className="w-3.5 h-3.5" /> Share
                                </button>
                              )}
                            </div>
                          )}
                          {!loading && i === lastIndex && !failed && followups.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {followups.map((f) => (
                                <button
                                  key={f}
                                  onClick={() => submit(f)}
                                  className="rounded-full border border-brass-500/60 bg-brass-500/10 px-3.5 py-1.5 text-left text-sm text-ink-800 hover:bg-brass-500/20 transition-colors"
                                >
                                  {f}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <form onSubmit={sendMessage} className="px-3 sm:px-6 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-paper">
          <div className="max-w-3xl mx-auto">
            <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
              <span className="shrink-0">Answer in</span>
              <div className="flex rounded-lg bg-slate-200/70 p-0.5" role="radiogroup" aria-label="Answer language">
                {LANGS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={lang === l.id}
                    title={l.full}
                    onClick={() => pickLang(l.id)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${lang === l.id ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-600 hover:text-ink-900'}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-2xl border border-slate-300 bg-white pl-4 pr-2 py-2 shadow-card focus-within:border-brass-500 focus-within:ring-2 focus-within:ring-brass-400/40">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={listening ? 'Listening…' : 'Ask about Indian laws, procedures, or rights…'}
                className="flex-1 min-w-0 bg-transparent py-1.5 text-base sm:text-[15px] text-ink-900 placeholder:text-slate-400 focus:outline-none"
                disabled={loading}
              />
              {SpeechRec && (
                <button
                  type="button"
                  onClick={toggleMic}
                  disabled={loading}
                  aria-label={listening ? 'Stop recording' : 'Speak your question'}
                  title={`Speak your question (${SPEECH_LANG[lang]})`}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                    listening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-500 hover:bg-slate-100 hover:text-ink-800'
                  }`}
                >
                  {listening ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-5 h-5" />}
                </button>
              )}
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-brass-300 hover:bg-ink-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
              >
                <ArrowUp className="w-5 h-5" />
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">
              General legal information, not legal advice. Consult a qualified lawyer for your situation.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
