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

Grounding (very important):
- When a SOURCES block is provided, it contains the official text of the Constitution of India retrieved from the database. Base your answer on it and cite as (Article N). Quote or paraphrase only what is actually in SOURCES.
- If SOURCES do not cover the question (for example criminal offences under BNS/BNSS/BSA, which are not loaded yet), say so in one short line and then answer from general knowledge, clearly marked "(general knowledge, please verify)".
- Never claim that text is in the Constitution unless it appears in SOURCES.

How to answer:
- Start with a direct answer in 1-2 lines, then give details with short headings or bullets.
- Cite the Act and section/Article number only when you are confident. Never invent sections, case names or citations. If unsure, say "please verify the exact section".
- Reply in the same language the user writes in (English, Hindi, Marathi, Hinglish/roman script).
- Be concise unless the user asks for detail.
- End with one short line that this is general information, not legal advice.`;

type Result = { ok: boolean; sent: boolean; error?: string; fatal?: boolean };


type Source = { ref: string; title: string; part: string; content: string };

function sbHeaders(token: string) {
  return {
    apikey: process.env.VITE_SUPABASE_ANON_KEY || '',
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

// Turns a question in any language into English search keywords (fast, optional).
async function extractKeywords(message: string): Promise<string> {
  const groq = process.env.GROQ_API_KEY;
  const cerebras = process.env.CEREBRAS_API_KEY;
  const target = groq
    ? { base: 'https://api.groq.com/openai/v1', key: groq, model: 'llama-3.1-8b-instant' }
    : cerebras
      ? { base: 'https://api.cerebras.ai/v1', key: cerebras, model: 'llama3.1-8b' }
      : null;
  if (!target) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(`${target.base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${target.key}` },
      body: JSON.stringify({
        model: target.model,
        temperature: 0,
        max_tokens: 40,
        messages: [
          {
            role: 'system',
            content:
              'Convert the user question about Indian law (English, Hindi, Marathi or Hinglish) into 3 to 8 lowercase English search keywords that would appear in the text or title of the relevant Articles of the Constitution of India. Example: "freedom speech expression" or "arrest detention magistrate". Output only the keywords separated by single spaces, no punctuation, no explanation.',
          },
          { role: 'user', content: message },
        ],
      }),
    });
    if (!r.ok) return '';
    const d: any = await r.json();
    return String(d?.choices?.[0]?.message?.content ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// Finds relevant Constitution text: exact "Article N" lookups + keyword search.
async function retrieveSources(message: string, token: string): Promise<Source[]> {
  const base = process.env.VITE_SUPABASE_URL;
  if (!base) return [];
  const found: Source[] = [];
  const seen = new Set<string>();
  const add = (rows: any[]) => {
    for (const r of rows ?? []) {
      if (!r?.ref || seen.has(r.ref)) continue;
      seen.add(r.ref);
      found.push({ ref: r.ref, title: r.title ?? '', part: r.part ?? '', content: r.content ?? '' });
    }
  };

  try {
    // a) exact article numbers, e.g. "Article 21", "Articles 14, 15 and 21", "art. 19(1)(a)", "अनुच्छेद 21"
    const nums = new Set<string>();
    const listRe = /(?:\barticles?|\bart\.?|अनुच्छेद|कलम)\s*((?:\d{1,3}[A-Za-z]{0,2}(?![A-Za-z])(?:\([^)]*\))*(?:\s*(?:,|and|&|to|व|आणि|और)\s*)?)+)/gi;
    for (const m of message.matchAll(listRe)) {
      const cleaned = m[1].replace(/\([^)]*\)/g, ' ');
      for (const n of cleaned.matchAll(/\d{1,3}[A-Za-z]{0,2}(?![A-Za-z])/g)) nums.add(n[0].toUpperCase());
    }
    if (nums.size) {
      const keys = [...nums].slice(0, 5).map((n) => `coi:${n}`).join(',');
      const r = await fetch(
        `${base}/rest/v1/law_chunks?select=ref,title,part,content&ref_key=in.(${encodeURIComponent(keys)})`,
        { headers: sbHeaders(token) }
      );
      if (r.ok) add(await r.json());
    }

    // b) keyword search (skipped when the user named exact Articles)
    const keywords = found.length ? '' : await extractKeywords(message);
    const queries: string[] = [];
    if (!found.length) {
      queries.push(keywords);
      if (/^[\x00-\x7F]+$/.test(message) && message.toLowerCase() !== keywords) queries.push(message.slice(0, 200));
    }
    for (const q of queries) {
      if (!q) continue;
      const r = await fetch(`${base}/rest/v1/rpc/search_law`, {
        method: 'POST',
        headers: sbHeaders(token),
        body: JSON.stringify({ q, n: 6 }),
      });
      if (r.ok) add(await r.json());
      if (found.length >= 7) break;
    }
  } catch (e: any) {
    console.error('retrieve failed', e?.message);
  }

  // keep the prompt small (free-tier token limits): Articles first, at most 2 Schedule chunks
  let budget = 8000;
  let schedules = 0;
  const out: Source[] = [];
  const ordered = [...found.filter((x) => x.part !== 'Schedules'), ...found.filter((x) => x.part === 'Schedules')];
  for (const s of ordered.slice(0, 7)) {
    const isSchedule = s.part === 'Schedules';
    if (isSchedule && schedules >= 2) continue;
    const content = s.content.slice(0, Math.min(isSchedule ? 1500 : 2500, budget));
    if (content.length < 50) break;
    budget -= content.length;
    if (isSchedule) schedules++;
    out.push({ ...s, content });
  }
  return out;
}

function buildUserPrompt(message: string, sources: Source[]): string {
  if (!sources.length) return message;
  const block = sources
    .map((s) => `[${s.ref}${s.title ? ' - ' + s.title : ''}${s.part ? ' (' + s.part + ')' : ''}]\n${s.content}`)
    .join('\n\n');
  return `SOURCES (Constitution of India, official text):\n${block}\n\nQUESTION:\n${message}`;
}

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

  // RAG: fetch relevant Constitution text (never blocks the answer if it fails)
  const sources = await retrieveSources(message, token);
  const prompt = buildUserPrompt(message, sources);
  const finish = () => {
    if (sources.length) {
      res.write(`\n\n---\n**Retrieved from the Constitution of India:** ${sources.map((x) => x.ref).join(', ')}`);
    }
    return res.end();
  };

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  let lastError = 'Model request failed.';
  const errors: string[] = [];
  const note = (who: string, e?: string) => {
    if (e) errors.push(`${who}: ${String(e).replace(/\s+/g, ' ').slice(0, 140)}`);
  };

  // 1) Claude first, if a key is configured
  if (claudeKey) {
    const r = await streamClaude(process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', claudeKey, prompt, res);
    if (r.ok || r.sent) return finish();
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
      const r = await streamOpenAICompat(p.label, p.base, p.key, m, prompt, res);
      if (r.ok || r.sent) return finish();
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

      const r = await streamGemini(model, geminiKey, prompt, res);
      if (r.ok || r.sent) return finish();
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
