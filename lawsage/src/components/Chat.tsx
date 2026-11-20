import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Plus, Bookmark, Check, Pin, Trash2 } from 'lucide-react';
import { useNavigate, useParams, useLocation, NavLink } from 'react-router-dom';
import { supabase, ChatMessage } from '../lib/supabase';
import { generateResponseStream } from '../lib/llm';
import ReactMarkdown from 'react-markdown';

type Convo = { session_id: string; title: string; created_at: string; pinned: boolean };

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConvos = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('session_id, content, created_at')
      .eq('role', 'user')
      .order('created_at', { ascending: true })
      .limit(1000);
    const { data: pins } = await supabase.from('pinned_chats').select('session_id');
    const pinned = new Set((pins || []).map((p: { session_id: string }) => p.session_id));
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
    if (error) console.error('Pin failed:', error);
    loadConvos();
  };

  const deleteChat = async (c: Convo) => {
    if (!window.confirm('Delete this chat? This cannot be undone.')) return;
    const { error } = await supabase.from('messages').delete().eq('session_id', c.session_id);
    if (error) return console.error('Delete failed:', error);
    await supabase.from('pinned_chats').delete().eq('session_id', c.session_id);
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

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
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
        { id: aiId, content: '_Thinking..._', role: 'assistant', created_at: new Date().toISOString(), session_id: sessionId },
      ]);

      const aiResponse = await generateResponseStream(userMessage, (text) => {
        setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, content: text } : m)));
      });

      const aiMessage: ChatMessage = {
        id: aiId,
        content: aiResponse,
        role: 'assistant',
        created_at: new Date(Date.now() + 1).toISOString(),
        session_id: sessionId,
      };

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

  return (
    <div className="flex h-full">
      <aside className="hidden md:flex w-64 flex-col border-r bg-white">
        <button
          onClick={() => navigate('/chat')}
          className="m-3 flex items-center justify-center space-x-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <Plus className="w-4 h-4" />
          <span>New chat</span>
        </button>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {convos.length === 0 && <p className="px-2 text-sm text-gray-500">No past chats yet.</p>}
          {convos.map((c) => (
            <div
              key={c.session_id}
              className={`group flex items-center rounded-lg mb-1 ${c.session_id === sessionId ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700 hover:bg-gray-100'}`}
            >
              <NavLink to={`/chat/${c.session_id}`} className="flex-1 min-w-0 truncate px-3 py-2 text-sm" title={c.title}>
                {c.title}
              </NavLink>
              <button
                onClick={() => togglePin(c)}
                aria-label={c.pinned ? 'Unpin' : 'Pin'}
                className={`p-1 ${c.pinned ? 'text-indigo-600' : 'text-gray-400 opacity-0 group-hover:opacity-100'} hover:text-indigo-700`}
              >
                <Pin className={`w-4 h-4 ${c.pinned ? 'fill-current' : ''}`} />
              </button>
              <button
                onClick={() => deleteChat(c)}
                aria-label="Delete chat"
                className="p-1 mr-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 bg-gray-50">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message, i) => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-3xl rounded-lg p-4 ${message.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white shadow-md'}`}>
                <ReactMarkdown className="prose prose-sm max-w-none">{message.content}</ReactMarkdown>
                {message.role === 'assistant' && !loading && !message.content.startsWith('Sorry, something went wrong') && (
                  <button
                    onClick={() => saveAnswer(i)}
                    disabled={saved.has(message.id)}
                    className="mt-2 flex items-center space-x-1 text-xs text-gray-500 hover:text-indigo-700 disabled:text-green-600"
                  >
                    {saved.has(message.id) ? <Check className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
                    <span>{saved.has(message.id) ? 'Saved' : 'Save'}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={sendMessage} className="p-4 border-t bg-white">
          <div className="flex space-x-4">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about Indian laws, legal procedures, or rights..."
              className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Processing...' : <Send className="w-5 h-5" />}
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Lawsage provides general legal information, not legal advice. Always consult with a qualified lawyer for specific legal matters.
          </p>
        </form>
      </div>
    </div>
  );
};