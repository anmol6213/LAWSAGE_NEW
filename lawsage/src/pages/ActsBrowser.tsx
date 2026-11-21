import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, ChevronRight, ChevronLeft, ArrowLeft, MessageSquare, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../lib/supabase';
import { EmptyState, PageHeader, btnPrimary, inputCls } from '../components/ui';
import { Courthouse } from '../components/Art';

type ActInfo = { act: string; source: string; sections: number; notes: string | null };
type Row = { ref: string; ref_key: string; title: string | null; part: string | null };
type Full = Row & { content: string; notes: string | null; source: string };

const baseKey = (k: string) => k.split('#')[0];
const secId = (k: string) => baseKey(k).split(':')[1] || '';
// "103" < "103A" < "104"; chunk parts ("#2") are merged into their section, never listed on their own
const secOrder = (k: string) => {
  const m = secId(k).match(/^(\d+)([A-Za-z]*)/);
  if (!m) return 1e12;
  const letters = m[2].toUpperCase().split('').reduce((n, c) => n * 27 + (c.charCodeAt(0) - 64), 0);
  return parseInt(m[1], 10) * 1000 + letters;
};

const SIZES = ['text-[0.92rem]', 'text-[1.02rem]', 'text-[1.15rem]', 'text-[1.3rem]'];

const fetchSections = async (act: string): Promise<Row[]> => {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('law_chunks')
      .select('ref, ref_key, title, part')
      .eq('act', act)
      .order('id')
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data as Row[]) || []));
    if (!data || data.length < 1000) break;
  }
  return out.filter((r) => !r.ref_key.includes('#'));
};

// A long section is stored as several chunks (key, key#2, key#3 ...); read them all and join
const fetchSection = async (key: string): Promise<Full | null> => {
  const cols = 'ref, ref_key, title, part, content, notes, source';
  const [first, rest] = await Promise.all([
    supabase.from('law_chunks').select(cols).eq('ref_key', key).maybeSingle(),
    supabase.from('law_chunks').select('ref_key, content').like('ref_key', `${key}#*`),
  ]);
  if (!first.data) return null;
  const extra = ((rest.data as { ref_key: string; content: string }[]) || [])
    .sort((a, b) => parseInt(a.ref_key.split('#')[1], 10) - parseInt(b.ref_key.split('#')[1], 10))
    .map((x) => x.content);
  const f = first.data as Full;
  return { ...f, content: [f.content, ...extra].join('\n\n') };
};

type Props = { jurisdiction: string; title: string; desc: string; emptyTitle: string; emptyDesc: string };

export const ActsBrowser = ({ jurisdiction, title, desc, emptyTitle, emptyDesc }: Props) => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const actParam = params.get('act');
  const secParam = params.get('sec');

  const [acts, setActs] = useState<ActInfo[]>([]);
  const [actsLoading, setActsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actQ, setActQ] = useState('');

  const [rows, setRows] = useState<Row[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Full | null>(null);
  const [opening, setOpening] = useState(false);
  const [size, setSize] = useState(1);
  const paneRef = useRef<HTMLDivElement>(null);

  const setParam = (changes: Record<string, string | null>) =>
    setParams((prev) => {
      const n = new URLSearchParams(prev);
      Object.entries(changes).forEach(([k, v]) => (v === null ? n.delete(k) : n.set(k, v)));
      return n;
    });

  // 1) the Acts of this jurisdiction
  useEffect(() => {
    (async () => {
      setActsLoading(true);
      const { data, error } = await supabase.rpc('list_acts', { j: jurisdiction });
      if (error) setError(`${error.message}. Run rag/acts_browser.sql in the Supabase SQL Editor.`);
      else setActs((data as ActInfo[]) || []);
      setActsLoading(false);
    })();
  }, [jurisdiction]);

  // 2) the sections of the chosen Act
  useEffect(() => {
    setQ('');
    if (!actParam) {
      setRows([]);
      return;
    }
    let cancel = false;
    (async () => {
      setRowsLoading(true);
      try {
        const r = await fetchSections(actParam);
        if (!cancel) setRows(r);
      } catch (e) {
        if (!cancel) setError((e as Error).message);
      }
      if (!cancel) setRowsLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [actParam]);

  // 3) the open section lives in the URL (?act=bns&sec=bns:103) so it can be linked to and survives refresh
  useEffect(() => {
    if (!secParam) {
      setOpen(null);
      return;
    }
    let cancel = false;
    (async () => {
      setOpening(true);
      const f = await fetchSection(secParam);
      if (cancel) return;
      setOpen(f);
      setOpening(false);
      paneRef.current?.scrollTo({ top: 0 });
    })();
    return () => {
      cancel = true;
    };
  }, [secParam]);

  const ordered = useMemo(() => [...rows].sort((a, b) => secOrder(a.ref_key) - secOrder(b.ref_key)), [rows]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map<string, Row[]>();
    ordered
      .filter((r) => !needle || secId(r.ref_key).toLowerCase() === needle || (r.title || '').toLowerCase().includes(needle) || `section ${secId(r.ref_key)}`.toLowerCase().includes(needle))
      .forEach((r) => {
        const k = r.part || 'Sections';
        map.set(k, [...(map.get(k) || []), r]);
      });
    return [...map.entries()].map(([k, items]) => ({ k, items }));
  }, [ordered, q]);

  const idx = open ? ordered.findIndex((r) => r.ref_key === baseKey(open.ref_key)) : -1;
  const prev = idx > 0 ? ordered[idx - 1] : null;
  const next = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;

  const actInfo = acts.find((a) => a.act === actParam);
  const actName = actInfo?.source || open?.source || actParam || '';
  const goSec = (r: Row) => setParam({ sec: r.ref_key });
  const closeSec = () => setParam({ sec: null });
  const closeAct = () => setParam({ act: null, sec: null });

  const askAi = () => {
    if (!open) return;
    const t = open.title ? ` (${open.title})` : '';
    navigate('/chat', { state: { prompt: `Explain Section ${secId(open.ref_key)}${t} of the ${open.source} in simple words, with a short practical example.` } });
  };

  const iconBtn = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink-800 hover:bg-slate-100 disabled:opacity-40';

  // ---------------------------------------------------------------- list of Acts
  if (!actParam) {
    const needle = actQ.trim().toLowerCase();
    const shown = acts.filter((a) => !needle || a.source.toLowerCase().includes(needle));
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto p-5 sm:p-8">
          <PageHeader title={title} desc={desc} />
          {acts.length > 3 && (
            <div className="relative mb-5 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={actQ} onChange={(e) => setActQ(e.target.value)} placeholder="Search Acts" className={`${inputCls} pl-9`} />
            </div>
          )}
          {actsLoading && <p className="text-sm text-slate-500">Loading…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!actsLoading && !error && acts.length === 0 && (
            <EmptyState icon={<FileText className="w-5 h-5" />} title={emptyTitle} desc={emptyDesc} />
          )}
          {!actsLoading && acts.length > 0 && shown.length === 0 && <p className="text-sm text-slate-500">No Act matches your search.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {shown.map((a) => (
              <button
                key={a.act}
                onClick={() => setParam({ act: a.act, sec: null })}
                className="group text-left rounded-2xl border border-line bg-white p-5 shadow-card hover:border-brass-400 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-ink-800 text-brass-400 flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-semibold text-ink-900 leading-snug">{a.source}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {a.sections} section{a.sections === 1 ? '' : 's'}
                      {a.notes ? ` · ${a.notes}` : ''}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 mt-1 text-slate-400 group-hover:text-brass-600" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- one Act: sections + reader
  const showReader = !!(secParam || open || opening);
  return (
    <div className="flex h-full">
      <div className={`${showReader ? 'hidden md:flex' : 'flex'} w-full md:w-96 border-r border-line bg-white flex-col`}>
        <div className="p-4 border-b border-line">
          <button onClick={closeAct} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-ink-800 hover:text-brass-700">
            <ArrowLeft className="w-4 h-4" /> All Acts
          </button>
          <h1 className="font-display text-xl font-semibold text-ink-900 mb-3 leading-snug">{actName}</h1>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search section number or title" className={`${inputCls} pl-9`} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {rowsLoading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
          {error && <p className="p-4 text-sm text-red-600">{error}</p>}
          {!rowsLoading && !error && groups.length === 0 && <p className="p-4 text-sm text-slate-500">No sections found.</p>}
          {groups.map((g) => (
            <details key={g.k} open={!!q.trim() || groups.length === 1 || g.items.some((r) => r.ref_key === secParam)} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-ink-800 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="w-4 h-4 shrink-0 text-brass-600 transition-transform group-open:rotate-90" />
                <span className="flex-1">{g.k}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500">{g.items.length}</span>
              </summary>
              <ul className="pb-2">
                {g.items.map((r) => (
                  <li key={r.ref_key}>
                    <button
                      onClick={() => goSec(r)}
                      className={`w-full text-left pl-10 pr-4 py-2.5 text-sm border-l-2 ${
                        open && baseKey(open.ref_key) === r.ref_key ? 'bg-brass-500/10 border-brass-500 text-ink-900' : 'border-transparent text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-semibold">Section {secId(r.ref_key)}</span>
                      {r.title && <span className="text-slate-500"> — {r.title}</span>}
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
          <button onClick={closeSec} className="md:hidden mb-4 inline-flex items-center gap-1 text-sm font-medium text-ink-800">
            <ArrowLeft className="w-4 h-4" /> Back to list
          </button>
        )}
        {opening && <p className="text-slate-500">Loading…</p>}
        {!opening && !open && (
          <div className="h-full min-h-[50vh] flex flex-col items-center justify-center text-center text-slate-500">
            <Courthouse tone="light" className="w-52 sm:w-60 h-auto opacity-80" />
            <p className="mt-4 font-display text-xl text-ink-800">{secParam ? 'Section not found' : 'Select a section'}</p>
            <p className="text-sm">{secParam ? 'Pick another one from the list.' : 'Pick one from the list to read its full text.'}</p>
          </div>
        )}
        {!opening && open && (
          <article className="max-w-3xl mx-auto bg-white rounded-2xl border border-line shadow-card px-5 sm:px-10 py-6 sm:py-8">
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <button onClick={() => prev && goSec(prev)} disabled={!prev} className={iconBtn} aria-label="Previous section" title={prev ? `Section ${secId(prev.ref_key)}` : undefined}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => next && goSec(next)} disabled={!next} className={iconBtn} aria-label="Next section" title={next ? `Section ${secId(next.ref_key)}` : undefined}>
                <ChevronRight className="w-4 h-4" />
              </button>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => setSize(Math.max(0, size - 1))} disabled={size === 0} className={`${iconBtn} text-xs font-semibold`} aria-label="Smaller text">A−</button>
                <button onClick={() => setSize(Math.min(SIZES.length - 1, size + 1))} disabled={size === SIZES.length - 1} className={`${iconBtn} text-base font-semibold`} aria-label="Larger text">A+</button>
              </div>
            </div>
            <p className="text-sm font-medium text-brass-700">{open.part || open.source}</p>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-ink-900 tracking-tight mt-1 mb-5">
              Section {secId(open.ref_key)}
              {open.title ? ` — ${open.title}` : ''}
            </h2>
            <div className={`md whitespace-pre-wrap leading-[1.8] ${SIZES[size]}`}><ReactMarkdown>{open.content}</ReactMarkdown></div>
            {open.notes && <p className="mt-6 pt-4 border-t border-line text-sm text-slate-500 whitespace-pre-wrap">{open.notes}</p>}
            <div className="mt-6 pt-4 border-t border-line">
              <button onClick={askAi} className={btnPrimary}>
                <MessageSquare className="w-4 h-4" /> Ask AI about this section
              </button>
              <p className="mt-2 text-xs text-slate-500">Text is taken from the official Act on India Code. General information, not legal advice.</p>
            </div>
            <div className="mt-6 pt-4 border-t border-line flex items-center justify-between gap-3 text-sm">
              {prev ? <button onClick={() => goSec(prev)} className="flex items-center gap-1 font-medium text-ink-800 hover:text-brass-700"><ChevronLeft className="w-4 h-4" />Section {secId(prev.ref_key)}</button> : <span />}
              {next ? <button onClick={() => goSec(next)} className="flex items-center gap-1 font-medium text-ink-800 hover:text-brass-700">Section {secId(next.ref_key)}<ChevronRight className="w-4 h-4" /></button> : <span />}
            </div>
          </article>
        )}
      </div>
    </div>
  );
};
