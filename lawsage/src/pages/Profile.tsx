import { useEffect, useState } from 'react';
import { LogOut, MessageSquare, Bookmark } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader } from '../components/ui';

export const Profile = () => {
  const [email, setEmail] = useState('');
  const [chats, setChats] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email || '');
      const { data: sessions } = await supabase.from('messages').select('session_id').eq('role', 'user');
      setChats(new Set((sessions || []).map((r: { session_id: string }) => r.session_id)).size);
      const { count } = await supabase.from('saved_responses').select('id', { count: 'exact', head: true });
      setSaved(count ?? 0);
    })();
  }, []);

  const stats = [
    { label: 'Conversations', value: chats, icon: MessageSquare },
    { label: 'Saved responses', value: saved, icon: Bookmark },
  ];

  return (
    <div className="max-w-2xl mx-auto p-5 sm:p-8">
      <PageHeader title="Profile" desc="Your account and activity." />
      <div className="bg-white rounded-2xl border border-line shadow-card overflow-hidden">
        <div className="h-20 bg-ink-900" />
        <div className="px-6 pb-6">
          <div className="-mt-9 flex items-end gap-4">
            <div className="w-[72px] h-[72px] rounded-2xl bg-ink-800 text-brass-300 border-4 border-white flex items-center justify-center font-display text-3xl font-semibold">
              {(email[0] || 'U').toUpperCase()}
            </div>
            <div className="pb-1 min-w-0">
              <p className="text-xs text-slate-500">Signed in as</p>
              <p className="font-semibold text-ink-900 truncate">{email || '—'}</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {stats.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-line bg-paper p-4">
                <Icon className="w-4 h-4 text-brass-600 mb-2" />
                <p className="font-display text-3xl font-semibold text-ink-900">{value ?? '…'}</p>
                <p className="text-sm text-slate-600">{label}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-ink-800 hover:bg-slate-50"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};
