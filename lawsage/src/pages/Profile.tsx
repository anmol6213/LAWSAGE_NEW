import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Profile</h1>
      <div className="bg-white rounded-lg shadow-md p-6 space-y-3">
        <div>
          <p className="text-xs text-gray-500">Email</p>
          <p className="text-gray-900">{email || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Conversations</p>
          <p className="text-gray-900">{chats ?? '…'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Saved responses</p>
          <p className="text-gray-900">{saved ?? '…'}</p>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-2 flex items-center space-x-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};
