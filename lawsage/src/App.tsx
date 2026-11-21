import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { supabase, hasSupabaseConfig } from './lib/supabase';
import { Auth } from './components/Auth';
import { Landing } from './pages/Landing';
import { Rights } from './pages/Rights';
import { Chat } from './components/Chat';
import { Logo } from './components/Art';
import { Navigation } from './components/Navigation';
import { Header } from './components/Header';
import { Constitution } from './pages/Constitution';
import { Database } from './pages/Database';
import { SavedResponses } from './pages/Saved';
import { Profile } from './pages/Profile';
import { ComingSoon } from './pages/ComingSoon';
import { CentralActs } from './pages/CentralActs';
import { StateActs } from './pages/StateActs';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [view, setView] = useState<'landing' | 'signin' | 'signup'>('landing');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-paper">
        <Logo className="w-12 h-12" />
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-line border-t-brass-500"></div>
      </div>
    );
  }

  if (!hasSupabaseConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-card border border-line text-center">
          <Logo className="w-12 h-12 mx-auto mb-4" />
          <h2 className="font-display text-2xl font-semibold text-ink-900 mb-2">Setup required</h2>
          <p className="text-slate-600 text-sm">
            Add <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">VITE_SUPABASE_URL</code> and{' '}
            <code className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">VITE_SUPABASE_ANON_KEY</code> to your environment variables, then redeploy.
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    if (view === 'landing') return <Landing onSignIn={() => setView('signin')} onGetStarted={() => setView('signup')} />;
    return <Auth key={view} initialMode={view} onBack={() => setView('landing')} />;
  }

  return (
    <Router>
      <div className="flex h-[100dvh] bg-paper">
        <Navigation open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="flex-1 flex flex-col min-w-0">
          <Header onMenu={() => setNavOpen(true)} />
          <main className="flex-1 min-h-0 overflow-y-auto bg-paper">
            <Routes>
              <Route path="/chat/:sessionId?" element={<Chat />} />
              <Route path="/rights" element={<Rights />} />
              <Route path="/database" element={<Database />} />
              <Route path="/saved" element={<SavedResponses />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/constitution" element={<Constitution />} />
              <Route path="/central-acts" element={<CentralActs />} />
              <Route path="/state-acts" element={<StateActs />} />
              <Route path="/judgments" element={<ComingSoon title="Supreme Court Judgments" note="Judgments will be added once the data is loaded." />} />
              <Route path="*" element={<Navigate to="/chat" replace />} />
              <Route path="/" element={<Navigate to="/chat" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}

export default App;