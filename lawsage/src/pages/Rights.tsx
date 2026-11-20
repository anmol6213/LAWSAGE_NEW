import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Phone, ChevronRight, Info } from 'lucide-react';
import { guides } from '../lib/rights';
import { PageHeader, btnPrimary } from '../components/ui';

export const Rights = () => {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const guide = guides.find((g) => g.id === params.get('guide'));

  if (!guide) {
    return (
      <div className="max-w-5xl mx-auto p-5 sm:p-8">
        <PageHeader title="Know your rights" desc="Step-by-step guides for common situations. Pick the one closest to yours." />
        <div className="grid sm:grid-cols-2 gap-4">
          {guides.map((g) => (
            <button
              key={g.id}
              onClick={() => setParams({ guide: g.id })}
              className="group text-left rounded-2xl border border-line bg-white p-5 shadow-card hover:border-brass-400 transition-colors flex gap-4"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-brass-400">
                <g.icon className="w-5 h-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl font-semibold text-ink-900">{g.title}</span>
                <span className="block mt-1 text-sm text-slate-600">{g.summary}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brass-700">
                  {g.steps.length} steps <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-8 flex gap-2 text-sm text-slate-500">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          General information, not legal advice. Procedures, fees and limits change, so verify with official sources or a lawyer.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-5 sm:p-8">
      <button onClick={() => setParams({})} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-800 hover:text-brass-700">
        <ArrowLeft className="w-4 h-4" /> All guides
      </button>

      <div className="rounded-2xl bg-ink-900 text-white p-6 sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-brass-400">
          <guide.icon className="w-6 h-6" />
        </span>
        <h1 className="mt-4 font-display text-3xl sm:text-4xl font-semibold tracking-tight">{guide.title}</h1>
        <p className="mt-2 text-slate-300 max-w-xl">{guide.summary}</p>
        {guide.helplines.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {guide.helplines.map((h) => (
              <a
                key={h.value}
                href={`tel:${h.value}`}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-sm hover:bg-white/10"
              >
                <Phone className="w-3.5 h-3.5 text-brass-400" />
                <span className="text-slate-300">{h.label}</span>
                <span className="font-semibold">{h.value}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <ol className="mt-6 space-y-3">
        {guide.steps.map((s, i) => (
          <li key={s.title} className="flex gap-4 rounded-2xl border border-line bg-white p-5 shadow-card">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass-400 font-semibold text-ink-950">{i + 1}</span>
            <div className="min-w-0">
              <h2 className="font-semibold text-ink-900">{s.title}</h2>
              <p className="mt-1 text-[15px] leading-relaxed text-slate-600">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      {guide.remember.length > 0 && (
        <div className="mt-6 rounded-2xl border border-brass-400/50 bg-brass-200/30 p-5">
          <h2 className="font-semibold text-ink-900">Keep in mind</h2>
          <ul className="mt-2 list-disc pl-5 space-y-1.5 text-[15px] text-slate-700 marker:text-brass-600">
            {guide.remember.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      )}

      <p className="mt-6 text-sm text-slate-500"><span className="font-medium text-slate-700">Based on:</span> {guide.law}</p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button onClick={() => navigate('/chat', { state: { prompt: guide.prompt } })} className={btnPrimary}>
          <MessageSquare className="w-4 h-4" /> Ask Lawsage about this
        </button>
        <span className="text-sm text-slate-500">Get an answer for your exact situation, in English, Hindi or Marathi.</span>
      </div>
      <p className="mt-8 flex gap-2 text-sm text-slate-500">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        General information, not legal advice. Procedures, fees and limits change, so verify with official sources or a lawyer.
      </p>
    </div>
  );
};
