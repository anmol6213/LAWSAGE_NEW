import { MessageSquare, BookOpen, Languages, ShieldCheck, Bookmark, Search, FileCheck2, Sun, Moon } from 'lucide-react';
import { useState } from 'react';
import { Courthouse, Logo } from '../components/Art';
import { applyTheme, getTheme, type Theme } from '../lib/theme';

const features = [
  { icon: BookOpen, title: 'Answers you can check', text: 'Every Article in an answer opens the official text of the Constitution of India in one tap.' },
  { icon: Languages, title: 'English, Hindi and Marathi', text: 'Choose the language of the answer, or speak your question instead of typing it.' },
  { icon: ShieldCheck, title: 'Guides for real situations', text: 'Step-by-step help for an arrest, an FIR, a consumer complaint, online fraud, RTI and more.' },
  { icon: Bookmark, title: 'Keep and share', text: 'Save answers, copy them, or download them as a PDF to show a lawyer.' },
];

const steps = [
  { icon: MessageSquare, title: 'Ask in your own words', text: 'Type or speak your question about a right, a procedure or a law.' },
  { icon: Search, title: 'See where it comes from', text: 'Lawsage retrieves the relevant Articles first, then explains them in plain language.' },
  { icon: FileCheck2, title: 'Verify and act', text: 'Open the source text, follow the next steps, and save what matters.' },
];

export const Landing = ({ onSignIn, onGetStarted }: { onSignIn: () => void; onGetStarted: () => void }) => {
  const [theme, setTheme] = useState<Theme>(getTheme);
  const flip = () => {
    const t: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    applyTheme(t);
  };

  return (
    <div className="min-h-screen bg-paper text-ink-900">
      {/* Hero */}
      <section className="bg-ink-900 text-white relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <header className="flex items-center gap-3 py-5">
            <Logo className="w-9 h-9" />
            <span className="font-display text-xl font-semibold tracking-tight">Lawsage</span>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <button onClick={flip} className="p-2 rounded-lg text-slate-300 hover:bg-white/10" aria-label="Toggle dark mode">
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button onClick={onSignIn} className="rounded-lg px-3 sm:px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10">Sign in</button>
              <button onClick={onGetStarted} className="rounded-lg bg-brass-400 px-3.5 sm:px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-brass-300">Get started</button>
            </div>
          </header>

          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-14 items-center pt-10 pb-16 sm:pt-16 sm:pb-24">
            <div>
              <h1 className="font-display text-[2.6rem] sm:text-6xl font-semibold leading-[1.05] tracking-tight">
                Know where you stand under Indian law.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-slate-300 leading-relaxed">
                Ask a legal question in English, Hindi or Marathi. Get a clear answer with the Constitution’s own text beside it, so you can verify every point.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={onGetStarted} className="rounded-lg bg-brass-400 px-6 py-3 text-[15px] font-semibold text-ink-950 hover:bg-brass-300">
                  Create a free account
                </button>
                <button onClick={onSignIn} className="rounded-lg border border-white/25 px-6 py-3 text-[15px] font-semibold hover:bg-white/10">
                  I already have an account
                </button>
              </div>
              <p className="mt-4 text-sm text-slate-400">General legal information, not legal advice.</p>
            </div>

            {/* Sample answer */}
            <div className="relative">
              <div className="rounded-2xl bg-white text-ink-900 shadow-lift p-5 sm:p-6 border border-white/10">
                <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-ink-800 px-4 py-2.5 text-sm text-white">
                  Can the police arrest me without telling me why?
                </div>
                <div className="mt-4 flex gap-3">
                  <Logo className="w-7 h-7 shrink-0 mt-0.5" />
                  <div className="min-w-0 text-[14.5px] leading-relaxed text-slate-700">
                    <p>
                      <strong className="text-ink-900">No.</strong> A person who is arrested must be told the grounds of arrest and can consult a lawyer of their choice.
                    </p>
                    <p className="mt-2">
                      Both rights come from <span className="article-link">Article 22</span>, which also requires you to be produced before a Magistrate within 24 hours.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {['What is a bailable offence?', 'Can I refuse to sign?'].map((c) => (
                        <span key={c} className="rounded-full border border-brass-500/60 bg-brass-500/10 px-3 py-1 text-xs text-ink-800">{c}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <Courthouse className="hidden lg:block absolute -bottom-14 -right-6 w-44 h-auto opacity-30" />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
        <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight max-w-2xl">Built so that you can trust what you read.</h2>
        <p className="mt-3 max-w-2xl text-slate-600">
          Lawsage searches the Constitution of India before it answers. When something comes from general knowledge instead, the answer says so.
        </p>
        <div className="mt-10 grid sm:grid-cols-2 gap-4">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-4 rounded-2xl border border-line bg-white p-5 sm:p-6 shadow-card">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-brass-400">
                <Icon className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-display text-xl font-semibold text-ink-900">{title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-slate-600">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-10 grid md:grid-cols-3 gap-8">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-400 font-semibold text-ink-950">{i + 1}</span>
                <div>
                  <h3 className="flex items-center gap-2 font-semibold text-ink-900"><Icon className="w-4 h-4 text-brass-600" />{title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-slate-600">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
        <div className="rounded-3xl bg-ink-900 px-6 py-12 sm:px-12 text-center text-white">
          <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight">Ask your first question.</h2>
          <p className="mt-3 text-slate-300">It takes a minute to create an account.</p>
          <button onClick={onGetStarted} className="mt-7 rounded-lg bg-brass-400 px-7 py-3 text-[15px] font-semibold text-ink-950 hover:bg-brass-300">
            Get started
          </button>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 sm:px-8 pb-10 text-sm text-slate-500">
        Lawsage provides general legal information, not legal advice. For your specific situation, consult a qualified lawyer.
      </footer>
    </div>
  );
};
