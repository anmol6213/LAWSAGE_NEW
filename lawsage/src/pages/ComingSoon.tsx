import { Link } from 'react-router-dom';
import { Courthouse } from '../components/Art';

export const ComingSoon = ({ title, note }: { title: string; note: string }) => (
  <div className="min-h-full flex items-center justify-center p-6">
    <div className="max-w-md w-full text-center bg-white rounded-2xl border border-line shadow-card px-8 py-10">
      <Courthouse tone="light" className="w-48 h-auto mx-auto mb-6" />
      <span className="inline-block rounded-full bg-brass-200/60 text-brass-700 text-xs font-semibold px-3 py-1 mb-3">In preparation</span>
      <h1 className="font-display text-3xl font-semibold text-ink-900 tracking-tight">{title}</h1>
      <p className="mt-2 text-slate-600 text-[15px]">{note}</p>
      <Link to="/constitution" className="mt-6 inline-flex items-center justify-center rounded-lg bg-ink-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-700">
        Read the Constitution meanwhile
      </Link>
    </div>
  </div>
);
