import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, BookOpen, ShieldCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../lib/supabase';

type Art = { ref: string; title: string | null; part: string | null; content: string; notes: string | null };

// Slide-over that shows the official text of one Article, so an answer can be checked in one tap.
export const ArticleDrawer = ({ refKey, onClose }: { refKey: string; onClose: () => void }) => {
  const [art, setArt] = useState<Art | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase.from('law_chunks').select('ref, title, part, content, notes').eq('ref_key', refKey).maybeSingle();
      if (!cancel) {
        setArt((data as Art) || null);
        setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [refKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const label = refKey.replace(/^coi:/, 'Article ');

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink-950/50" onClick={onClose} aria-hidden />
      <aside className="relative flex w-full sm:w-[30rem] flex-col bg-white shadow-lift" role="dialog" aria-label={label}>
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" /> Official text, Constitution of India
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-ink-900 leading-snug">
              {art ? art.ref : label}
              {art?.title && art.title !== art.ref ? ` — ${art.title}` : ''}
            </h2>
            {art?.part && <p className="mt-0.5 text-sm text-slate-500">{art.part}</p>}
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-500 hover:text-ink-800" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading && <p className="text-slate-500">Loading…</p>}
          {!loading && !art && (
            <p className="text-slate-600">
              We could not find {label} in the database. It may be a clause number or an Article that is not loaded yet.
            </p>
          )}
          {art && (
            <>
              <div className="md whitespace-pre-wrap leading-[1.8]"><ReactMarkdown>{art.content}</ReactMarkdown></div>
              {art.notes && <p className="mt-5 pt-4 border-t border-line text-sm text-slate-500 whitespace-pre-wrap">{art.notes}</p>}
            </>
          )}
        </div>

        <div className="border-t border-line px-5 py-3">
          <Link
            to={`/constitution?article=${encodeURIComponent(refKey)}`}
            onClick={onClose}
            className="inline-flex items-center gap-2 text-sm font-semibold text-ink-800 hover:text-brass-700"
          >
            <BookOpen className="w-4 h-4" /> Open in the Constitution reader
          </Link>
        </div>
      </aside>
    </div>
  );
};
