// Vercel Serverless Function: /api/chat
// Gemini key stays on the server (never in the browser bundle).

const SYSTEM_PROMPT =
  'You are Lawsage, a legal information assistant for Indian law. ' +
  'Give clear, accurate, well-structured answers about Indian laws, acts, sections and legal procedures. ' +
  'Mention the relevant Act and section where you are confident. ' +
  'If you are unsure, say so. This is general information, not legal advice; ' +
  'remind the user to consult a qualified lawyer for their specific situation.';

async function verifyUser(token: string): Promise<boolean> {
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return false;
  const r = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  return r.ok;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!(await verifyUser(token))) {
    return res.status(401).json({ error: 'Please sign in first.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server.' });
  }

  const message = String(req.body?.message ?? '').trim().slice(0, 4000);
  if (!message) {
    return res.status(400).json({ error: 'Message is empty.' });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
        }),
      }
    );

    const data: any = await r.json();
    if (!r.ok) {
      console.error('Gemini error', r.status, JSON.stringify(data));
      return res.status(502).json({ error: data?.error?.message || 'Model request failed.' });
    }

    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p?.text ?? '')
      .join('')
      .trim();

    if (!text) {
      return res.status(502).json({ error: 'Model returned an empty answer.' });
    }
    return res.status(200).json({ text });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error.' });
  }
}
