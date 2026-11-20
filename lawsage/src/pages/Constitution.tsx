import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronRight, ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../lib/supabase';
import { inputCls } from '../components/ui';
import { Courthouse } from '../components/Art';

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
      <div className={`${open || opening ? 'hidden md:flex' : 'flex'} w-full md:w-96 border-r border-line bg-white flex-col`}>
        <div className="p-4 border-b border-line">
          <h1 className="font-display text-xl font-semibold text-ink-900 mb-3">Constitution of India</h1>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search article number or title" className={`${inputCls} pl-9`} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
          {error && <p className="p-4 text-sm text-red-600">{error}</p>}
          {!loading && !error && groups.length === 0 && <p className="p-4 text-sm text-slate-500">No articles found.</p>}
          {groups.map((g) => (
            <details key={g.k} open={!!q.trim() || g.k === 'Preamble'} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink-800 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="w-4 h-4 text-brass-600 transition-transform group-open:rotate-90" />
                <span className="flex-1">{g.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{g.items.length}</span>
              </summary>
              <ul className="pb-2">
                {g.items.map((r) => (
                  <li key={r.ref_key}>
                    <button
                      onClick={() => openRow(r)}
                      className={`w-full text-left pl-10 pr-4 py-2 text-sm border-l-2 ${
                        open?.ref_key === r.ref_key ? 'bg-ink-800/[0.07] border-brass-500 text-ink-900' : 'border-transparent text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-semibold">{r.ref}</span>
                      {r.title && r.title !== r.ref && <span className="text-slate-500"> — {r.title}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
      <div className={`${open || opening ? 'block' : 'hidden md:block'} flex-1 overflow-y-auto p-5 sm:p-8`}>
        {(open || opening) && (
          <button onClick={() => setOpen(null)} className="md:hidden mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink-800">
            <ArrowLeft className="w-4 h-4" /> Back to list
          </button>
        )}
        {opening && <p className="text-slate-500">Loading…</p>}
        {!opening && !open && (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
            <Courthouse tone="light" className="w-60 h-auto opacity-80" />
            <p className="mt-4 font-display text-xl text-ink-800">Select an article</p>
            <p className="text-sm">Pick one from the list to read its full text.</p>
          </div>
        )}
        {!opening && open && (
          <article className="max-w-3xl mx-auto bg-white rounded-2xl border border-line shadow-card px-6 sm:px-10 py-8">
            {open.part && <p className="text-sm font-medium text-brass-700">{open.part}</p>}
            <h2 className="font-display text-3xl font-semibold text-ink-900 tracking-tight mt-1 mb-5">
              {open.ref}
              {open.title && open.title !== open.ref ? ` — ${open.title}` : ''}
            </h2>
            <div className="md whitespace-pre-wrap text-[1.02rem] leading-[1.8]"><ReactMarkdown>{open.content}</ReactMarkdown></div>
            {open.notes && <p className="mt-6 pt-4 border-t border-line text-sm text-slate-500 whitespace-pre-wrap">{open.notes}</p>}
          </article>
        )}
      </div>
    </div>
  );
};
