import React, { useState } from 'react';
import { Eye, EyeOff, Mail, Lock, MessageSquare, BookOpen, Bookmark, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Courthouse, Logo } from './Art';

const points = [
  { icon: MessageSquare, text: 'Ask about your rights and procedures in plain language' },
  { icon: BookOpen, text: 'Read and search the Constitution of India' },
  { icon: Bookmark, text: 'Save the answers you want to come back to' },
];

export const Auth = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) setNotice('Account created. Check your email to confirm it, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (signUp: boolean) => {
    setIsSignUp(signUp);
    setError(null);
    setNotice(null);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-paper">
      {/* Brand panel */}
      <section className="hidden lg:flex flex-col justify-between bg-ink-900 text-white p-12 xl:p-16 relative overflow-hidden">
        <div className="flex items-center gap-3">
          <Logo className="w-10 h-10" />
          <span className="font-display text-2xl font-semibold tracking-tight">Lawsage</span>
        </div>

        <div className="max-w-lg">
          <h1 className="font-display text-5xl xl:text-[3.4rem] font-semibold leading-[1.08] tracking-tight">
            Indian law, explained clearly.
          </h1>
          <p className="mt-5 text-lg text-slate-300 leading-relaxed">
            An AI legal assistant built on the text of the law, so you can understand your position before you speak to a lawyer.
          </p>
          <ul className="mt-9 space-y-4">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3.5 text-[15.5px] text-slate-200">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/8 border border-white/10 text-brass-400">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <Courthouse className="w-full max-w-md h-auto -mb-2 opacity-95" />
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[26rem]">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <Logo className="w-10 h-10" />
            <span className="font-display text-2xl font-semibold text-ink-900 tracking-tight">Lawsage</span>
          </div>

          <h2 className="font-display text-3xl font-semibold text-ink-900 tracking-tight">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="mt-1.5 text-slate-600">
            {isSignUp ? 'Start with your email and a password.' : 'Sign in to continue to your chats.'}
          </p>

          <div className="mt-7 grid grid-cols-2 rounded-xl bg-slate-200/70 p-1 text-sm font-semibold" role="tablist">
            {[false, true].map((mode) => (
              <button
                key={String(mode)}
                type="button"
                role="tab"
                aria-selected={isSignUp === mode}
                onClick={() => switchMode(mode)}
                className={`rounded-lg py-2 transition-colors ${isSignUp === mode ? 'bg-white text-ink-900 shadow-sm' : 'text-slate-600 hover:text-ink-900'}`}
              >
                {mode ? 'Create account' : 'Sign in'}
              </button>
            ))}
          </div>

          <form className="mt-6 space-y-5" onSubmit={handleAuth}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-ink-800 mb-1.5">Email address</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="email" name="email" type="email" required autoComplete="email"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 py-2.5 text-[15px] placeholder:text-slate-400 focus:outline-none focus:border-brass-500 focus:ring-2 focus:ring-brass-400/40"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink-800 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="password" name="password" type={show ? 'text' : 'password'} required minLength={6}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSignUp ? 'At least 6 characters' : 'Your password'}
                  className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-11 py-2.5 text-[15px] placeholder:text-slate-400 focus:outline-none focus:border-brass-500 focus:ring-2 focus:ring-brass-400/40"
                />
                <button
                  type="button" onClick={() => setShow(!show)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-ink-800"
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
              </div>
            )}
            {notice && (
              <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> <span>{notice}</span>
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full rounded-lg bg-ink-800 py-3 text-[15px] font-semibold text-white hover:bg-ink-700 active:bg-ink-900 disabled:opacity-60 transition-colors"
            >
              {loading ? 'Please wait…' : isSignUp ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-xs text-slate-500 leading-relaxed">
            Lawsage gives general legal information, not legal advice. For your specific situation, consult a qualified lawyer.
          </p>
        </div>
      </section>
    </div>
  );
};
