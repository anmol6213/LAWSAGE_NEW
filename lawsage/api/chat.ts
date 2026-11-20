// Vercel Serverless Function: /api/chat  (streaming)
// Gemini key stays on the server (never in the browser bundle).

const SYSTEM_PROMPT = `You are Lawsage, an expert legal information assistant for Indian law.

Scope: the Constitution of India (Articles, Fundamental Rights, DPSP, Fundamental Duties, Schedules, Amendments), Central and State Acts, procedure, and landmark Supreme Court / High Court judgments.

Important, current law (always use these, mention the old law only for comparison):
- Bharatiya Nyaya Sanhita, 2023 (BNS) replaced the Indian Penal Code (IPC) from 1 July 2024.
- Bharatiya Nagarik Suraksha Sanhita, 2023 (BNSS) replaced the Code of Criminal Procedure (CrPC).
- Bharatiya Sakshya Adhiniyam, 2023 (BSA) replaced the Indian Evidence Act.
For offences before 1 July 2024 the old IPC/CrPC/Evidence Act still apply to those cases.

How to answer:
- Start with a direct answer in 1-2 lines, then give details with short headings or bullets.
- Cite the Act and section/Article number only when you are confident. Never invent sections, case names or citations. If unsure, say "please verify the exact section".
- Reply in the same language the user writes in (English, Hindi, Marathi, Hinglish/roman script).
- Be concise unless the user asks for detail.
- End with one short line that this is general information, not legal advice.`;

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

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        }),
      }
    );

    if (!r.ok || !r.body) {
      const errText = await r.text();
      console.error('Gemini error', r.status, errText);
      let msg = 'Model request failed.';
      try {
        msg = JSON.parse(errText)?.error?.message || msg;
      } catch {
        /* ignore */
      }
      return res.status(502).json({ error: msg });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let sent = false;

    const handleLine = (line: string) => {
      if (!line.startsWith('data:')) return;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') return;
      try {
        const json = JSON.parse(payload);
        const parts = json?.candidates?.[0]?.content?.parts ?? [];
        for (const p of parts) {
          if (p?.text && !p?.thought) {
            res.write(p.text);
            sent = true;
          }
        }
      } catch {
        /* ignore partial JSON */
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(handleLine);
    }
    if (buffer) handleLine(buffer);

    if (!sent) res.write('Sorry, the model returned an empty answer. Please try again.');
    return res.end();
  } catch (e: any) {
    console.error(e);
    if (!res.headersSent) {
      return res
        .status(e?.name === 'AbortError' ? 504 : 500)
        .json({ error: e?.name === 'AbortError' ? 'The model took too long. Try again.' : 'Server error.' });
    }
    return res.end();
  } finally {
    clearTimeout(timer);
  }
}
