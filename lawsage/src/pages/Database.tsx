import { useState } from 'react';
import { Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../lib/supabase';
import { PageHeader, btnPrimary, inputCls } from '../components/ui';
import { Courthouse } from '../components/Art';

type Hit = { ref: string; title: string | null; part: string | null; content: string };

export const Database = () => {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const run = async (e?: React.FormEvent, override?: string) => {
    e?.preventDefault();
    const term = (override ?? q).trim();
    if (!term) return;
    setLoading(true);
    setError('');
    setExpanded(null);
    // "21", "art 21", "Article 21A" -> exact article lookup; anything else -> keyword search
    const m = term.match(/^(?:article|art\.?)?\s*(\d+[a-z]{0,2})$/i);
    const res = m
      ? await supabase.from('law_chunks').select('ref, title, part, content').eq('ref', `Article ${m[1].toUpperCase()}`)
      : await supabase.rpc('search_law', { q: term, n: 12 });
    if (res.error) setError(res.error.message);
    else setHits((res.data as Hit[]) || []);
    setLoading(false);
  };

  const examples = ['Article 21', 'freedom of speech', 'right to equality', 'Article 370'];
  const search = (term: string) => {
    setQ(term);
    run(undefined, term);
  };

  return (
    <div className="max-w-4xl mx-auto p-5 sm:p-8">
      <PageHeader title="Legal database" desc="Search the law text by article number or keyword. Currently available: Constitution of India." />
      <form onSubmit={(e) => run(e)} className="flex gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Article 21, or freedom of speech"
            className={`${inputCls} pl-10 py-3`}
          />
        </div>
        <button disabled={loading} className={`${btnPrimary} px-6`}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Try:</span>
        {examples.map((e) => (
          <button key={e} type="button" onClick={() => search(e)} className="rounded-full border border-line bg-white px-3 py-1 text-ink-700 hover:border-brass-400">
            {e}
          </button>
        ))}
      </div>

      {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {hits && hits.length === 0 && <p className="mt-8 text-slate-600">No results for “{q}”. Try an article number or a different keyword.</p>}
      {!hits && !loading && (
        <div className="mt-10 flex flex-col items-center text-center text-slate-500">
          <Courthouse tone="light" className="w-52 h-auto opacity-80" />
          <p className="mt-4 text-sm">Results will appear here.</p>
        </div>
      )}
      {hits && hits.length > 0 && <p className="mt-6 mb-2 text-sm text-slate-500">{hits.length} {hits.length === 1 ? 'result' : 'results'}</p>}
      <ul className="space-y-3 mt-2">
        {hits?.map((h) => {
          const isOpen = expanded === h.ref;
          const text = isOpen || h.content.length <= 300 ? h.content : h.content.slice(0, 300) + '…';
          return (
            <li key={h.ref} className="bg-white rounded-2xl border border-line shadow-card p-5 border-l-4 border-l-brass-500">
              {h.part && <p className="text-xs font-medium text-brass-700">{h.part}</p>}
              <h2 className="font-display text-xl font-semibold text-ink-900">
                {h.ref}
                {h.title && h.title !== h.ref ? ` — ${h.title}` : ''}
              </h2>
              <div className="md whitespace-pre-wrap mt-2 text-slate-700"><ReactMarkdown>{text}</ReactMarkdown></div>
              {h.content.length > 300 && (
                <button onClick={() => setExpanded(isOpen ? null : h.ref)} className="mt-3 text-sm font-semibold text-brass-700 hover:text-brass-600">
                  {isOpen ? 'Show less' : 'Read full text'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};
