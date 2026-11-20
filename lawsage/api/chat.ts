// Vercel Serverless Function: /api/chat  (streaming, multi-provider with fallback)
// Keys stay on the server (never in the browser bundle).
//
// Env vars (Vercel -> Settings -> Environment Variables):
//   GROQ_API_KEY        free (console.groq.com)        optional GROQ_MODEL
//   CEREBRAS_API_KEY    free (cloud.cerebras.ai)       optional CEREBRAS_MODEL
//   GEMINI_API_KEY      free tier (Google AI Studio)
//   GEMINI_MODEL        optional, preferred Gemini model
//   ANTHROPIC_API_KEY   optional, paid; if set, Claude is tried first
//   ANTHROPIC_MODEL     optional, default claude-sonnet-5-5 (use claude-haiku-5-5 for faster/cheaper)

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

type Result = { ok: boolean; sent: boolean; error?: string; fatal?: boolean };

async function verifyUser(token: string): Promise<boolean> {
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return false;
  const r = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  });
  return r.ok;
}

async function errorText(r: Response): Promise<string> {
  const t = await r.text();
  try {
    const j = JSON.parse(t);
    return j?.error?.message || j?.error || t.slice(0, 300);
  } catch {
    return t.slice(0, 300) || `HTTP ${r.status}`;
  }
}

// Reads an SSE response, writes extracted text to `res`. Returns true if any text was sent.
async function pipeSse(
  r: Response,
  extract: (json: any) => string,
  res: any,
  onFirst: () => void
): Promise<boolean> {
  const reader = r.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sent = false;

  const handleLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const text = extract(JSON.parse(payload));
      if (text) {
        if (!sent) onFirst();
        res.write(text);
        sent = true;
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
  return sent;
}

async function streamGemini(model: string, apiKey: string, message: string, res: any): Promise<Result> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000); // give up if no text within 25s
  let sent = false;
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
      const error = await errorText(r);
      console.error('Gemini', model, r.status, error);
      return { ok: false, sent: false, error, fatal: r.status === 401 || r.status === 403 };
    }
    sent = await pipeSse(
      r,
      (j) =>
        (j?.candidates?.[0]?.content?.parts ?? [])
          .filter((p: any) => p?.text && !p?.thought)
          .map((p: any) => p.text)
          .join(''),
      res,
      () => clearTimeout(timer)
    );
    return sent ? { ok: true, sent } : { ok: false, sent: false, error: 'Empty answer' };
  } catch (e: any) {
    console.error('Gemini', model, e?.message);
    return { ok: false, sent, error: e?.name === 'AbortError' ? 'Timeout' : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function streamClaude(model: string, apiKey: string, message: string, res: any): Promise<Result> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let sent = false;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        stream: true,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: message }],
      }),
    });
    if (!r.ok || !r.body) {
      const error = await errorText(r);
      console.error('Claude', model, r.status, error);
      return { ok: false, sent: false, error };
    }
    sent = await pipeSse(
      r,
      (j) => (j?.type === 'content_block_delta' && j?.delta?.type === 'text_delta' ? j.delta.text : ''),
      res,
      () => clearTimeout(timer)
    );
    return sent ? { ok: true, sent } : { ok: false, sent: false, error: 'Empty answer' };
  } catch (e: any) {
    console.error('Claude', model, e?.message);
    return { ok: false, sent, error: e?.name === 'AbortError' ? 'Timeout' : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function streamOpenAICompat(
  label: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  message: string,
  res: any
): Promise<Result> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let sent = false;
  try {
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message },
        ],
      }),
    });
    if (!r.ok || !r.body) {
      const error = await errorText(r);
      console.error(label, model, r.status, error);
      return { ok: false, sent: false, error: `${label}: ${error}` };
    }
    sent = await pipeSse(r, (j) => j?.choices?.[0]?.delta?.content ?? '', res, () => clearTimeout(timer));
    return sent ? { ok: true, sent } : { ok: false, sent: false, error: `${label}: empty answer` };
  } catch (e: any) {
    console.error(label, model, e?.message);
    return { ok: false, sent, error: `${label}: ${e?.name === 'AbortError' ? 'timeout' : String(e?.message || e)}` };
  } finally {
    clearTimeout(timer);
  }
}

// Asks Google which Flash models this key can use, so fallbacks never depend on guessed names.
let flashCache: string[] | null = null;
async function discoverFlashModels(apiKey: string): Promise<string[]> {
  if (flashCache) return flashCache;
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      headers: { 'x-goog-api-key': apiKey },
    });
    const d: any = await r.json();
    flashCache = (d?.models ?? [])
      .filter(
        (m: any) =>
          (m.supportedGenerationMethods ?? []).includes('generateContent') &&
          /^models\/gemini-\d+(\.\d+)?-flash(-lite)?$/i.test(m.name)
      )
      .map((m: any) => String(m.name).replace(/^models\//, ''))
      .sort()
      .reverse();
  } catch {
    flashCache = [];
  }
  return flashCache!;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!(await verifyUser(token))) {
    return res.status(401).json({ error: 'Please sign in first.' });
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  if (!geminiKey && !claudeKey && !groqKey && !cerebrasKey) {
    return res.status(500).json({ error: 'No API key set on the server (GROQ_API_KEY, CEREBRAS_API_KEY, GEMINI_API_KEY or ANTHROPIC_API_KEY).' });
  }

  const message = String(req.body?.message ?? '').trim().slice(0, 4000);
  if (!message) {
    return res.status(400).json({ error: 'Message is empty.' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  let lastError = 'Model request failed.';
  const errors: string[] = [];
  const note = (who: string, e?: string) => {
    if (e) errors.push(`${who}: ${String(e).replace(/\s+/g, ' ').slice(0, 140)}`);
  };

  // 1) Claude first, if a key is configured
  if (claudeKey) {
    const r = await streamClaude(process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', claudeKey, message, res);
    if (r.ok || r.sent) return res.end();
    note('Claude', r.error);
  }

  // 2) Groq (free, very fast), then 3) Cerebras (free, fast)
  const compat = [
    {
      label: 'Groq',
      base: 'https://api.groq.com/openai/v1',
      key: groqKey,
      models: [process.env.GROQ_MODEL, 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    },
    {
      label: 'Cerebras',
      base: 'https://api.cerebras.ai/v1',
      key: cerebrasKey,
      models: [process.env.CEREBRAS_MODEL, 'gpt-oss-120b', 'llama3.1-8b'],
    },
  ];
  for (const p of compat) {
    if (!p.key) continue;
    const seen = new Set<string>();
    for (const m of p.models) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      const r = await streamOpenAICompat(p.label, p.base, p.key, m, message, res);
      if (r.ok || r.sent) return res.end();
      note(`${p.label} ${m}`, r.error);
    }
  }

  // 4) Gemini with automatic fallback to other Flash models
  if (geminiKey) {
    const tried = new Set<string>();
    const primary = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const queue: string[] = [primary];
    let discovered = false;

    while (queue.length && tried.size < 4) {
      const model = queue.shift()!;
      if (tried.has(model)) continue;
      tried.add(model);

      const r = await streamGemini(model, geminiKey, message, res);
      if (r.ok || r.sent) return res.end();
      note(`Gemini ${model}`, r.error);
      if (r.fatal) break;

      if (!queue.length && !discovered) {
        discovered = true;
        queue.push(...(await discoverFlashModels(geminiKey)));
      }
    }
  }

  // Nothing worked
  res.removeHeader('Content-Type');
  const missing = [!groqKey && 'GROQ_API_KEY', !cerebrasKey && 'CEREBRAS_API_KEY'].filter(Boolean).join(', ');
  return res.status(502).json({
    error: `[api v5] ${errors.join(' | ') || lastError}${missing ? ` (not set: ${missing})` : ''}`,
  });
}
