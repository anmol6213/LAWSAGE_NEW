import { supabase } from './supabase';

export const generateResponse = async (input: string): Promise<string> => {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const token = session?.access_token;
  if (!token) throw new Error('Please sign in first.');

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message: input }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.text) {
    throw new Error(data.error || 'Failed to generate response. Please try again.');
  }
  return data.text as string;
};
