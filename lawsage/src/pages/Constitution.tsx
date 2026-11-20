import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../lib/supabase';

type Row = { ref: string; ref_key: string; title: string | null; part: string | null };
type Full = Row & { content: string; notes: string | null };

// Part names in the data are inconsistent in case / chapter suffixes; group by the Part number.
const partKey = (p: string | null) => {
  if (!p) return 'Other';
  const m = p.match(/^Part\s+([IVXLC]+[A-Z]?)\b/i);
  return m ? `Part ${m[1].toUpperCase()}` : p.split(' - ')[0];
};
const romanOrder = (k: string) => {
  const m = k.match(/^Part ([IVXLC]+)([A-Z]?)$/);
  if (!m) return k === 'Other' ? 1e6 : 1e5;
  const v: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  let n = 0;
  const s = m[1];
  for (let i = 0; i < s.length; i++) n += v[s[i]] < (v[s[i + 1]] || 0) ? -v[s[i]] : v[s[i]];
  return n * 10 + (m[2] ? m[2].charCodeAt(0) - 64 : 0);
};
const num = (ref: string) => {
  const m = ref.match(/(\d+)([A-Z]*)/);
  return m ? parseInt(m[1], 10) * 100 + (m[2] ? m[2].charCodeAt(0) - 64 : 0) : -1;
};

export const Constitution = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Full | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('law_chunks')
        .select('ref, ref_key, title, part')
        .eq('source', 'Constitution of India')
        .range(0, 999);
      if (error) setError(error.message);
      else setRows((data as Row[]) || []);
      setLoading(false);
    })();
  }, []);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter(
      (r) => !needle || r.ref.toLowerCase().includes(needle) || (r.title || '').toLowerCase().includes(needle)
    );
    const map = new Map<string, Row[]>();
    filtered.forEach((r) => {
      const k = r.ref === 'Preamble' ? 'Preamble' : partKey(r.part);
      map.set(k, [...(map.get(k) || []), r]);
    });
    const label = (k: string) => {
      const names = (map.get(k) || []).map((r) => r.part || '').filter(Boolean);
      const best = names.sort((a, b) => a.length - b.length)[0];
      return best ? best.replace(/\s+chapter.*$/i, '').replace(/\s*\d+\*+/g, '') : k;
    };
    return [...map.entries()]
      .sort((a, b) => (a[0] === 'Preamble' ? -1 : b[0] === 'Preamble' ? 1 : romanOrder(a[0]) - romanOrder(b[0])))
      .map(([k, items]) => ({ k, label: k === 'Preamble' ? 'Preamble' : label(k), items: items.sort((a, b) => num(a.ref) - num(b.ref)) }));
  }, [rows, q]);

  const openRow = async (r: Row) => {
    setOpening(true);
    const { data } = await supabase.from('law_chunks').select('ref, ref_key, title, part, content, notes').eq('ref_key', r.ref_key).single();
    setOpen((data as Full) || null);
    setOpening(false);
  };

  return (
    <div className="flex h-full">
      <div className={`${open || opening ? 'hidden md:flex' : 'flex'} w-full md:w-96 border-r bg-white flex-col`}>
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold text-gray-900 mb-2">Constitution of India</h1>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search article number or title"
              className="w-full pl-9 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-4 text-sm text-gray-500">Loading...</p>}
          {error && <p className="p-4 text-sm text-red-600">{error}</p>}
          {!loading && !error && groups.length === 0 && <p className="p-4 text-sm text-gray-500">No articles found.</p>}
          {groups.map((g) => (
            <details key={g.k} open={!!q.trim() || g.k === 'Preamble'} className="border-b">
              <summary className="cursor-pointer p-3 text-sm font-semibold text-gray-800 hover:bg-gray-50">
                {g.label} <span className="text-gray-400 font-normal">({g.items.length})</span>
              </summary>
              <ul>
                {g.items.map((r) => (
                  <li key={r.ref_key}>
                    <button
                      onClick={() => openRow(r)}
                      className={`w-full text-left px-5 py-2 text-sm hover:bg-indigo-50 ${open?.ref_key === r.ref_key ? 'bg-indigo-100 text-indigo-700' : 'text-gray-700'}`}
                    >
                      <span className="font-medium">{r.ref}</span>
                      {r.title && r.title !== r.ref && <span className="text-gray-500"> — {r.title}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
      <div className={`${open || opening ? 'block' : 'hidden md:block'} flex-1 overflow-y-auto p-6`}>
        {(open || opening) && (
          <button onClick={() => setOpen(null)} className="md:hidden mb-3 text-sm text-indigo-700">← Back to list</button>
        )}
        {opening && <p className="text-gray-500">Loading...</p>}
        {!opening && !open && <p className="text-gray-500">Select an article to read its full text.</p>}
        {!opening && open && (
          <article className="max-w-3xl bg-white rounded-lg shadow-md p-6">
            <p className="text-sm text-indigo-700 font-medium">{open.part}</p>
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {open.ref}
              {open.title && open.title !== open.ref ? ` — ${open.title}` : ''}
            </h2>
            <ReactMarkdown className="prose prose-sm max-w-none whitespace-pre-wrap">{open.content}</ReactMarkdown>
            {open.notes && <p className="mt-4 pt-4 border-t text-xs text-gray-500 whitespace-pre-wrap">{open.notes}</p>}
          </article>
        )}
      </div>
    </div>
  );
};
