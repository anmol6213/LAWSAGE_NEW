import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '../lib/supabase';

type Saved = { id: string; question: string | null; answer: string; created_at: string };

export const SavedResponses = () => {
  const [items, setItems] = useState<Saved[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('saved_responses').select('id, question, answer, created_at').order('created_at', { ascending: false });
      if (error) setError(error.message);
      else setItems((data as Saved[]) || []);
      setLoading(false);
    })();
  }, []);

  const remove = async (id: string) => {
    const { error } = await supabase.from('saved_responses').delete().eq('id', id);
    if (error) setError(error.message);
    else setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Saved Responses</h1>
      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {!loading && !error && items.length === 0 && <p className="text-gray-500">Nothing saved yet. Use the Save button under an AI answer in Chat.</p>}
      <ul className="space-y-4">
        {items.map((i) => (
          <li key={i.id} className="bg-white rounded-lg shadow-md p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                {i.question && <p className="font-semibold text-gray-900">{i.question}</p>}
                <p className="text-xs text-gray-500">{new Date(i.created_at).toLocaleString()}</p>
              </div>
              <button onClick={() => remove(i.id)} className="text-gray-400 hover:text-red-600" aria-label="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <ReactMarkdown className="prose prose-sm max-w-none">{i.answer}</ReactMarkdown>
          </li>
        ))}
      </ul>
    </div>
  );
};
