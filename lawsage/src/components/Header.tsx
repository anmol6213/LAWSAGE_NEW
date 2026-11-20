import { useEffect, useState } from 'react';
import { LogOut, Menu, Moon, Sun } from 'lucide-react';
import { applyTheme, getTheme, type Theme } from '../lib/theme';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const titles: Record<string, string> = {
  chat: 'AI Chat',
  rights: 'Know Your Rights',
  database: 'Legal Database',
  saved: 'Saved Responses',
  profile: 'Profile',
  constitution: 'Constitution of India',
  'central-acts': 'Central Acts',
  'state-acts': 'State Acts',
  judgments: 'Supreme Court Judgments',
};

export const Header = ({ onMenu }: { onMenu: () => void }) => {
  const { pathname } = useLocation();
  const [email, setEmail] = useState('');
  const [theme, setTheme] = useState<Theme>(getTheme);
  const flip = () => {
    const t: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(t);
    applyTheme(t);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ''));
  }, []);

  const title = titles[pathname.split('/')[1]] || 'Lawsage';
  const initial = (email[0] || 'U').toUpperCase();

  return (
    <header className="h-16 shrink-0 bg-white border-b border-line flex items-center gap-3 px-4 sm:px-6">
      <button onClick={onMenu} className="md:hidden p-2 -ml-2 text-ink-800 hover:bg-slate-100 rounded-lg" aria-label="Open menu">
        <Menu className="w-5 h-5" />
      </button>
      <h1 className="font-display text-xl font-semibold text-ink-900 truncate">{title}</h1>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2.5 rounded-full border border-line pl-1 pr-3.5 py-1">
          <span className="w-7 h-7 rounded-full bg-ink-800 text-brass-300 text-xs font-semibold flex items-center justify-center">{initial}</span>
          <span className="text-sm text-slate-600 max-w-[200px] truncate">{email || 'Account'}</span>
        </div>
        <button onClick={flip} className="rounded-lg p-2 text-ink-800 hover:bg-slate-100" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
        </button>
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-800 hover:bg-slate-100"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
};
