import type { ReactNode } from 'react';

export const PageHeader = ({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) => (
  <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
    <div>
      <h1 className="font-display text-3xl font-semibold text-ink-900 tracking-tight">{title}</h1>
      {desc && <p className="mt-1 text-[15px] text-slate-600 max-w-xl">{desc}</p>}
    </div>
    {action}
  </div>
);

export const EmptyState = ({ icon, title, desc, action }: { icon: ReactNode; title: string; desc: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center text-center py-14 px-6 bg-white border border-dashed border-slate-300 rounded-2xl">
    <div className="w-12 h-12 rounded-full bg-ink-800 text-brass-400 flex items-center justify-center mb-4">{icon}</div>
    <h2 className="font-display text-xl font-semibold text-ink-900">{title}</h2>
    <p className="mt-1 text-sm text-slate-600 max-w-sm">{desc}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const btnPrimary =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-ink-800 text-white text-sm font-semibold hover:bg-ink-700 active:bg-ink-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base sm:text-[15px] text-ink-900 placeholder:text-slate-400 focus:outline-none focus:border-brass-500 focus:ring-2 focus:ring-brass-400/40';
