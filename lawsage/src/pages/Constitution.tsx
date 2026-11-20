import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronRight, ChevronLeft, ArrowLeft, Bookmark, BookmarkCheck } from 'lucide-react';
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

const SIZES = ['text-[0.92rem]', 'text-[1.02rem]', 'text-[1.15rem]', 'text-[1.3rem]'];
const MARKS_KEY = 'lawsage_coi_bookmarks';
const SIZE_KEY = 'lawsage_reader_size';

const loadMarks = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(MARKS_KEY) || '[]'));
  } catch {
    return new Set();
  }
};

const buildGroups = (rows: Row[], needle: string, marks: Set<string> | null) => {
  const filtered = rows.filter(
    (r) =>
      (!needle || r.ref.toLowerCase().includes(needle) || (r.title || '').toLowerCase().includes(needle)) &&
      (!marks || marks.has(r.ref_key))
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
};

export const Constitution = () => {
  const [params, setParams] = useSearchParams();
  const articleParam = params.get('article');

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Full | null>(null);
  const [opening, setOpening] = useState(false);
  const [marks, setMarks] = useState<Set<string>>(loadMarks);
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [size, setSize] = useState<number>(() => {
    const v = Number(localStorage.getItem(SIZE_KEY));
    return Number.isInteger(v) && v >= 0 && v < SIZES.length ? v : 1;
  });
  const paneRef = useRef<HTMLDivElement>(null);

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

  // The open article lives in the URL (?article=coi:21) so it can be linked to and survives refresh
  useEffect(() => {
    if (!articleParam) {
      setOpen(null);
      return;
    }
    let cancel = false;
    (async () => {
      setOpening(true);
      const { data } = await supabase
        .from('law_chunks')
        .select('ref, ref_key, title, part, content, notes')
        .eq('ref_key', articleParam)
        .maybeSingle();
      if (cancel) return;
      setOpen((data as Full) || null);
      setOpening(false);
      paneRef.current?.scrollTo({ top: 0 });
    })();
    return () => {
      cancel = true;
    };
  }, [articleParam]);

  const groups = useMemo(() => buildGroups(rows, q.trim().toLowerCase(), onlyMarked ? marks : null), [rows, q, onlyMarked, marks]);
  const ordered = useMemo(() => buildGroups(rows, '', null).flatMap((g) => g.items), [rows]);
  const idx = open ? ordered.findIndex((r) => r.ref_key === open.ref_key) : -1;
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;

  const go = (r: Row) => setParams({ article: r.ref_key });
  const close = () => setParams({});

  const toggleMark = (key: string) => {
    const n = new Set(marks);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    setMarks(n);
    try {
      localStorage.setItem(MARKS_KEY, JSON.stringify([...n]));
    } catch {
      /* ignore */
    }
  };
  const changeSize = (d: number) => {
    const v = Math.min(SIZES.length - 1, Math.max(0, size + d));
    setSize(v);
    try {
      localStorage.setItem(SIZE_KEY, String(v));
    } catch {
      /* ignore */
    }
  };

  const showReader = !!(articleParam || open || opening);
  const marked = open ? marks.has(open.ref_key) : false;
  const iconBtn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-800 hover:bg-slate-100 disabled:opacity-40';

  return (
    <div className="flex h-full">
      <div className={`${showReader ? 'hidden md:flex' : 'flex'} w-full md:w-96 border-r border-line bg-white flex-col`}>
        <div className="p-4 border-b border-line">
          <h1 className="font-display text-xl font-semibold text-ink-900 mb-3">Constitution of India</h1>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search article number or title" className={`${inputCls} pl-9`} />
          </div>
          <button
            onClick={() => setOnlyMarked(!onlyMarked)}
            className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
              onlyMarked ? 'border-brass-500 bg-brass-500/10 text-ink-900' : 'border-line text-slate-600 hover:border-brass-400'
            }`}
          >
            <BookmarkCheck className="w-3.5 h-3.5" /> Bookmarked ({marks.size})
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
          {error && <p className="p-4 text-sm text-red-600">{error}</p>}
          {!loading && !error && groups.length === 0 && (
            <p className="p-4 text-sm text-slate-500">{onlyMarked ? 'No bookmarks yet. Open an article and tap the bookmark icon.' : 'No articles found.'}</p>
          )}
          {groups.map((g) => (
            <details key={g.k} open={!!q.trim() || onlyMarked || g.k === 'Preamble'} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink-800 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="w-4 h-4 text-brass-600 transition-transform group-open:rotate-90" />
                <span className="flex-1">{g.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{g.items.length}</span>
              </summary>
              <ul className="pb-2">
                {g.items.map((r) => (
                  <li key={r.ref_key}>
                    <button
                      onClick={() => go(r)}
                      className={`w-full text-left pl-10 pr-4 py-2.5 text-sm border-l-2 flex items-center gap-2 ${
                        open?.ref_key === r.ref_key ? 'bg-brass-500/10 border-brass-500 text-ink-900' : 'border-transparent text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex-1 min-w-0">
                        <span className="font-semibold">{r.ref}</span>
                        {r.title && r.title !== r.ref && <span className="text-slate-500"> — {r.title}</span>}
                      </span>
                      {marks.has(r.ref_key) && <BookmarkCheck className="w-3.5 h-3.5 shrink-0 text-brass-600" />}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>

      <div ref={paneRef} className={`${showReader ? 'block' : 'hidden md:block'} flex-1 overflow-y-auto p-4 sm:p-8`}>
        {showReader && (
          <button onClick={close} className="md:hidden mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink-800">
            <ArrowLeft className="w-4 h-4" /> Back to list
          </button>
        )}
        {opening && <p className="text-slate-500">Loading…</p>}
        {!opening && !open && (
          <div className="h-full min-h-[50vh] flex flex-col items-center justify-center text-center text-slate-500">
            <Courthouse tone="light" className="w-52 sm:w-60 h-auto opacity-80" />
            <p className="mt-4 font-display text-xl text-ink-800">{articleParam ? 'Article not found' : 'Select an article'}</p>
            <p className="text-sm">{articleParam ? 'Pick another one from the list.' : 'Pick one from the list to read its full text.'}</p>
          </div>
        )}
        {!opening && open && (
          <article className="max-w-3xl mx-auto bg-white rounded-2xl border border-line shadow-card px-5 sm:px-10 py-6 sm:py-8">
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <div className="flex items-center gap-2">
                <button onClick={() => prev && go(prev)} disabled={!prev} className={iconBtn} aria-label="Previous article" title={prev?.ref}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => next && go(next)} disabled={!next} className={iconBtn} aria-label="Next article" title={next?.ref}>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => changeSize(-1)} disabled={size === 0} className={`${iconBtn} text-xs font-semibold`} aria-label="Smaller text">A−</button>
                <button onClick={() => changeSize(1)} disabled={size === SIZES.length - 1} className={`${iconBtn} text-base font-semibold`} aria-label="Larger text">A+</button>
                <button
                  onClick={() => toggleMark(open.ref_key)}
                  className={`${iconBtn} ${marked ? 'border-brass-500 bg-brass-500/10 text-brass-700' : ''}`}
                  aria-label={marked ? 'Remove bookmark' : 'Bookmark this article'}
                  aria-pressed={marked}
                >
                  {marked ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {open.part && <p className="text-sm font-medium text-brass-700">{open.part}</p>}
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-ink-900 tracking-tight mt-1 mb-5">
              {open.ref}
              {open.title && open.title !== open.ref ? ` — ${open.title}` : ''}
            </h2>
            <div className={`md whitespace-pre-wrap leading-[1.8] ${SIZES[size]}`}><ReactMarkdown>{open.content}</ReactMarkdown></div>
            {open.notes && <p className="mt-6 pt-4 border-t border-line text-sm text-slate-500 whitespace-pre-wrap">{open.notes}</p>}
            <div className="mt-8 pt-4 border-t border-line flex items-center justify-between gap-3 text-sm">
              {prev ? <button onClick={() => go(prev)} className="flex items-center gap-1 font-medium text-ink-800 hover:text-brass-700"><ChevronLeft className="w-4 h-4" />{prev.ref}</button> : <span />}
              {next ? <button onClick={() => go(next)} className="flex items-center gap-1 font-medium text-ink-800 hover:text-brass-700">{next.ref}<ChevronRight className="w-4 h-4" /></button> : <span />}
            </div>
          </article>
        )}
      </div>
    </div>
  );
};
