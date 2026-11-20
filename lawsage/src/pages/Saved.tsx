import { useEffect, useState } from 'react';
import { Trash2, Bookmark, Copy, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../lib/supabase';
import { PageHeader, EmptyState, btnPrimary } from '../components/ui';

type Saved = { id: string; question: string | null; answer: string; created_at: string };

export const SavedResponses = () => {
  const [items, setItems] = useState<Saved[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('saved_responses').select('id, question, answer, created_at').order('created_at', { ascending: false });
      if (error) setError(error.message);
      else setItems((data as Saved[]) || []);
      setLoading(false);
    })();
  }, []);

  const remove = async (id: string) => {
    const { error } = await supabase.from('saved_responses').delete().eq('id', id);
    if (error) setError(error.message);
    else setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const copy = async (i: Saved) => {
    try {
      await navigator.clipboard.writeText(i.answer);
      setCopied(i.id);
      setTimeout(() => setCopied((c) => (c === i.id ? null : c)), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-5 sm:p-8">
      <PageHeader title="Saved responses" desc="Answers you kept from your chats." />
      {loading && <p className="text-slate-500">Loading…</p>}
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon={<Bookmark className="w-5 h-5" />}
          title="Nothing saved yet"
          desc="Use Save under any AI answer in Chat to keep it here."
          action={<Link to="/chat" className={btnPrimary}>Go to chat</Link>}
        />
      )}
      <ul className="space-y-4">
        {items.map((i) => (
          <li key={i.id} className="bg-white rounded-2xl border border-line shadow-card overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-5 py-4 bg-ink-900 text-white">
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold leading-snug">{i.question || 'Saved answer'}</p>
                <p className="mt-0.5 text-xs text-slate-400">{new Date(i.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => copy(i)} className="p-2 text-slate-300 hover:text-brass-300" aria-label="Copy answer">
                  {copied === i.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
                <button onClick={() => remove(i.id)} className="p-2 text-slate-300 hover:text-red-400" aria-label="Delete saved response">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="px-5 py-4 md"><ReactMarkdown>{i.answer}</ReactMarkdown></div>
          </li>
        ))}
      </ul>
    </div>
  );
};
