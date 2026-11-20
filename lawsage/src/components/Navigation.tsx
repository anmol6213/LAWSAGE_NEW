import { NavLink } from 'react-router-dom';
import { MessageSquare, Database, Bookmark, User, BookOpen, FileText, Landmark, Scale, X } from 'lucide-react';
import { Courthouse, Logo } from './Art';

type Item = { to: string; label: string; icon: typeof Scale; soon?: boolean };

const workspace: Item[] = [
  { to: '/chat', label: 'AI Chat', icon: MessageSquare },
  { to: '/database', label: 'Legal Database', icon: Database },
  { to: '/saved', label: 'Saved Responses', icon: Bookmark },
  { to: '/profile', label: 'Profile', icon: User },
];

const library: Item[] = [
  { to: '/constitution', label: 'Constitution', icon: BookOpen },
  { to: '/central-acts', label: 'Central Acts', icon: FileText, soon: true },
  { to: '/state-acts', label: 'State Acts', icon: Landmark, soon: true },
  { to: '/judgments', label: 'Supreme Court Judgments', icon: Scale, soon: true },
];

export const Navigation = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const link = ({ isActive }: { isActive: boolean }) =>
    `group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14.5px] font-medium transition-colors ${
      isActive ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;

  const render = (items: Item[]) =>
    items.map(({ to, label, icon: Icon, soon }) => (
      <NavLink key={to} to={to} onClick={onClose} className={link}>
        {({ isActive }) => (
          <>
            {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brass-400" />}
            <Icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-brass-400' : 'text-slate-400 group-hover:text-brass-300'}`} />
            <span className="flex-1 leading-tight">{label}</span>
            {soon && <span className="text-[11px] rounded-full border border-white/15 px-2 py-0.5 text-slate-400">Soon</span>}
          </>
        )}
      </NavLink>
    ));

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-ink-950/60 md:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 md:w-64 md:static md:translate-x-0 flex flex-col bg-ink-900 text-white transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-5 h-16 shrink-0 border-b border-white/10">
          <Logo className="w-9 h-9" />
          <div className="leading-tight">
            <p className="font-display text-xl font-semibold tracking-tight">Lawsage</p>
            <p className="text-[11.5px] text-slate-400">Indian legal assistant</p>
          </div>
          <button onClick={onClose} className="ml-auto md:hidden p-1.5 text-slate-300 hover:text-white" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-5">
          <p className="px-3 mb-2 text-xs font-medium text-slate-500">Workspace</p>
          <div className="space-y-0.5 mb-7">{render(workspace)}</div>
          <p className="px-3 mb-2 text-xs font-medium text-slate-500">Legal library</p>
          <div className="space-y-0.5">{render(library)}</div>
        </nav>

        <div className="m-3 mt-0 rounded-xl border border-white/10 bg-ink-800/80 p-4">
          <Courthouse className="w-full h-auto" />
          <p className="mt-3 text-[13px] leading-snug text-slate-300">
            Plain-language answers on Indian law. General information, not legal advice.
          </p>
        </div>
      </aside>
    </>
  );
};
