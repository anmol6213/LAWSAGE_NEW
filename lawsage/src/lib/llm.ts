import { supabase } from './supabase';

// Streams the answer: onChunk is called with each new piece of text.
export const generateResponseStream = async (
  input: string,
  onChunk: (text: string) => void,
  language: string = 'auto'
): Promise<string> => {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const token = session?.access_token;
  if (!token) throw new Error('Please sign in first.');

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message: input, language }),
  });

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to generate response. Please try again.');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    full += chunk;
    onChunk(full);
  }
  return full;
};
