import { useState } from 'react';
import { Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../lib/supabase';

type Hit = { ref: string; title: string | null; part: string | null; content: string };

export const Database = () => {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
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

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Legal Database</h1>
      <p className="text-sm text-gray-600 mb-4">Search all available law text by article number or keyword. Currently: Constitution of India.</p>
      <form onSubmit={run} className="flex space-x-3 mb-6">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Article 21, or freedom of speech"
            className="w-full pl-9 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {hits && hits.length === 0 && <p className="text-gray-500">No results for "{q}".</p>}
      <ul className="space-y-3">
        {hits?.map((h) => {
          const isOpen = expanded === h.ref;
          const text = isOpen || h.content.length <= 300 ? h.content : h.content.slice(0, 300) + '…';
          return (
            <li key={h.ref} className="bg-white rounded-lg shadow-md p-4">
              <p className="text-xs text-indigo-700">{h.part}</p>
              <h2 className="font-semibold text-gray-900">
                {h.ref}
                {h.title && h.title !== h.ref ? ` — ${h.title}` : ''}
              </h2>
              <ReactMarkdown className="prose prose-sm max-w-none whitespace-pre-wrap mt-2">{text}</ReactMarkdown>
              {h.content.length > 300 && (
                <button onClick={() => setExpanded(isOpen ? null : h.ref)} className="mt-2 text-sm text-indigo-700">
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
