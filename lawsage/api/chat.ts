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

Grounding (very important, strict):
- When a SOURCES block is provided, it contains the official text of provisions (Articles of the Constitution and sections of Acts) retrieved from the database. Base your answer on it and cite as (Article N) or (Act short name, Section N).
- Cite ONLY section or Article numbers that appear in SOURCES. Never state a section number, punishment, time limit or case name from memory, not even in the "General knowledge" part. If an Act is not in SOURCES, do not guess its section numbers (old IPC/CrPC numbers are NOT BNS/BNSS numbers).
- If SOURCES do not cover part of the question, say so plainly in one line ("This is not in my database yet") and give only plain-language practical guidance for that part, without section numbers.
- Answer the situation the user actually describes. Do not escalate to a more serious offence (for example, "he beats me" is physical domestic violence, not murder, unless the user says someone was killed).
- Use a source only if it directly applies; ignore retrieved text that does not fit. If the Constitution has no specific provision on the topic, say so in one line and move on to the statute.
- Keep legal terms in English even in Hindi/Marathi answers (FIR, Magistrate, Protection Officer, One Stop Centre, DLSA, Domestic Incident Report). Do not translate them literally.
- For practical legal-help questions (violence, arrest, complaints, consumer or RTI problems) always add short practical steps: where to file (police, Magistrate, Protection Officer, One Stop Centre, DLSA free legal aid), emergency helplines (112, 181 for women), and what evidence or documents to keep.

How to answer:
- Start with a direct answer in 1-2 lines, then give details with short headings or bullets.
- Cite the Act and section/Article number only when it appears in SOURCES. Never invent sections, case names or citations.
- Reply in ONE language only. Never repeat the same answer in a second language.
- Match the user's script: if they write Hindi or Marathi words in English letters (Hinglish / Marathi-English), reply in the same simple roman-letter style with no Devanagari. Use Devanagari only if the user writes in Devanagari. If they write plain English, reply in English.
- Layout: a short direct answer first, then a clear explanation (with the Article text in simple words), then "General knowledge (please verify)" only if you add anything that is not in SOURCES (for example case law names).
- Be concise unless the user asks for detail.
- End with one short line that this is general information, not legal advice.
- After that line, add ONE final line in exactly this format and write nothing after it: [[followups: question 1 | question 2 | question 3]]
  The three questions are short (at most 8 words each) follow-ups the user is likely to ask next, written in the same language and script as your answer.`;

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
    ? { base: 'https://api.groq.com/openai/v1', key: groq }
    : cerebras
      ? { base: 'https://api.cerebras.ai/v1', key: cerebras }
      : null;
  if (!target) return '';
  const ids = await discoverCompat(target.base, target.key);
  const model = ids.find((id) => /instant|8b|20b|scout|small|mini/i.test(id)) || ids[0] || 'openai/gpt-oss-20b';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(`${target.base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${target.key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 200,
        ...(/gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {}),
        messages: [
          {
            role: 'system',
            content:
              'Convert the user question about Indian law (English, Hindi, Marathi or Hinglish) into 3 to 8 lowercase English search keywords that would appear in the text or title of the relevant provisions of Indian law (Articles of the Constitution or sections of Acts such as BNS, BNSS, BSA, the Domestic Violence Act, RTI Act). Describe the legal concept, not the words used: "husband beats wife" = "domestic violence cruelty protection order"; "police arrested me" = "arrest without warrant rights". Example: "freedom speech expression" or "domestic violence protection order residence". Output only the keywords separated by single spaces, no punctuation, no explanation.',
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

// ---------- Law retrieval: Constitution + Acts (hybrid keyword + vector search) ----------
// Codes must match the `act` column loaded by scripts/ingest_act.py. Add an alias here when you load a new Act.
const ACT_ALIASES: Record<string, string> = {
  bns: 'bns', 'bharatiya nyaya sanhita': 'bns',
  bnss: 'bnss', 'bharatiya nagarik suraksha sanhita': 'bnss',
  bsa: 'bsa', 'bharatiya sakshya adhiniyam': 'bsa',
  ipc: 'ipc', 'indian penal code': 'ipc',
  crpc: 'crpc', 'code of criminal procedure': 'crpc',
  iea: 'iea', 'indian evidence act': 'iea', 'evidence act': 'iea',
  pwdva: 'pwdva', 'domestic violence act': 'pwdva', 'dv act': 'pwdva',
  rti: 'rti', 'rti act': 'rti', 'right to information act': 'rti',
};
const OLD_ACTS = new Set(['ipc', 'crpc', 'iea']);
const ACT_RE = Object.keys(ACT_ALIASES)
  .sort((a, b) => b.length - a.length)
  .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'))
  .join('|');
const SEC_WORD = '(?:sections?|sec\\.?|s\\.|धारा|कलम)';
const NUM = '(\\d{1,3}[A-Za-z]{0,2})(?![A-Za-z0-9])';
const RE_SEC_THEN_ACT = new RegExp(`${SEC_WORD}\\s*${NUM}(?:\\([^)]*\\))*\\s*(?:of\\s+(?:the\\s+)?)?(${ACT_RE})\\b`, 'gi');
const RE_ACT_THEN_SEC = new RegExp(`\\b(${ACT_RE})\\s*(?:${SEC_WORD})?\\s*${NUM}`, 'gi');
const RE_NUM_THEN_ACT = new RegExp(`(?<![\\d.])${NUM}\\s*(?:of\\s+(?:the\\s+)?)?(${ACT_RE})\\b`, 'gi'); // "498A IPC"
const MIN_SIM = Number(process.env.RAG_MIN_SIM || 0.5); // tune with scripts/eval_rag.py
const MAX_SOURCES = Number(process.env.RAG_MAX_SOURCES || 6);

// Query embedding (multilingual, 768-d). Returns null if no key / failure, then search falls back to keywords only.
async function embedQuery(text: string): Promise<number[] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        model: `models/${model}`,
        content: { parts: [{ text: text.slice(0, 2000) }] },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768,
      }),
    });
    if (!r.ok) return null;
    const d: any = await r.json();
    const v = d?.embedding?.values;
    return Array.isArray(v) && v.length === 768 ? v : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Finds relevant law text: exact "Article N" / "Section N <Act>" lookups (incl. IPC->BNS mapping) + hybrid search.
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
  const byKeys = async (keys: string[]) => {
    if (!keys.length) return;
    const r = await fetch(
      `${base}/rest/v1/law_chunks?select=ref,title,part,content&ref_key=in.(${encodeURIComponent(keys.slice(0, 8).join(','))})`,
      { headers: sbHeaders(token) }
    );
    if (r.ok) add(await r.json());
  };

  try {
    // a) exact article numbers, e.g. "Article 21", "Articles 14, 15 and 21", "art. 19(1)(a)", "अनुच्छेद 21"
    const nums = new Set<string>();
    const listRe = /(?:\barticles?|\bart\.?|अनुच्छेद|कलम)\s*((?:\d{1,3}[A-Za-z]{0,2}(?![A-Za-z])(?:\([^)]*\))*(?:\s*(?:,|and|&|to|व|आणि|और)\s*)?)+)/gi;
    for (const m of message.matchAll(listRe)) {
      const cleaned = m[1].replace(/\([^)]*\)/g, ' ');
      for (const n of cleaned.matchAll(/\d{1,3}[A-Za-z]{0,2}(?![A-Za-z])/g)) nums.add(n[0].toUpperCase());
    }
    await byKeys([...nums].slice(0, 5).map((n) => `coi:${n}`));

    // b) exact statute sections, e.g. "section 85 BNS", "BNS 85", "498A IPC"; old IPC/CrPC/IEA numbers are mapped to BNS/BNSS/BSA
    const pairs = new Map<string, [string, string]>();
    for (const m of message.matchAll(RE_SEC_THEN_ACT)) {
      const act = ACT_ALIASES[m[2].toLowerCase().replace(/\s+/g, ' ')];
      if (act) pairs.set(`${act}:${m[1].toUpperCase()}`, [act, m[1].toUpperCase()]);
    }
    for (const m of message.matchAll(RE_ACT_THEN_SEC)) {
      const act = ACT_ALIASES[m[1].toLowerCase().replace(/\s+/g, ' ')];
      if (act) pairs.set(`${act}:${m[2].toUpperCase()}`, [act, m[2].toUpperCase()]);
    }
    for (const m of message.matchAll(RE_NUM_THEN_ACT)) {
      const act = ACT_ALIASES[m[2].toLowerCase().replace(/\s+/g, ' ')];
      if (act) pairs.set(`${act}:${m[1].toUpperCase()}`, [act, m[1].toUpperCase()]);
    }
    const direct: string[] = [];
    for (const [act, sec] of pairs.values()) {
      direct.push(`${act}:${sec}`);
      if (OLD_ACTS.has(act)) {
        const r = await fetch(
          `${base}/rest/v1/law_mapping?select=new_act,new_section&old_act=eq.${act}&old_section=eq.${encodeURIComponent(sec)}`,
          { headers: sbHeaders(token) }
        );
        if (r.ok) for (const x of await r.json()) direct.push(`${x.new_act}:${String(x.new_section).toUpperCase()}`);
      }
    }
    await byKeys(direct);

    // c) hybrid search (skipped when the user named exact provisions)
    if (!found.length) {
      const keywords = await extractKeywords(message);
      const qe = await embedQuery(keywords ? `${keywords}. ${message}` : message);
      const q = keywords || (/^[\x00-\x7F]+$/.test(message) ? message.slice(0, 200) : '');
      let rows: any[] | null = null;
      if (q || qe) {
        const r = await fetch(`${base}/rest/v1/rpc/search_law_v2`, {
          method: 'POST',
          headers: sbHeaders(token),
          body: JSON.stringify({ q, qe, n: 12 }),
        });
        if (r.ok) rows = await r.json();
        else console.error('search_law_v2 failed', r.status); // migration not applied yet -> fall back below
      }
      if (rows) {
        // keep only chunks that really match: all keywords present, or similar enough in meaning.
        // Until embeddings are loaded (no row has a sim value) keep the plain keyword results, like before.
        const hasVectors = rows.some((x) => typeof x.sim === 'number');
        add(
          (hasVectors ? rows.filter((x) => x.strict_hit || (typeof x.sim === 'number' && x.sim >= MIN_SIM)) : rows).slice(0, MAX_SOURCES)
        );
      } else if (q) {
        const r = await fetch(`${base}/rest/v1/rpc/search_law`, {
          method: 'POST',
          headers: sbHeaders(token),
          body: JSON.stringify({ q, n: 6 }),
        });
        if (r.ok) add(await r.json());
      }
    }
  } catch (e: any) {
    console.error('retrieve failed', e?.message);
  }

  // keep the prompt small (free-tier token limits): Articles/sections first, at most 2 Schedule chunks
  let budget = 8000;
  let schedules = 0;
  const out: Source[] = [];
  const ordered = [...found.filter((x) => x.part !== 'Schedules'), ...found.filter((x) => x.part === 'Schedules')];
  for (const s of ordered.slice(0, MAX_SOURCES + 1)) {
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

const LANGUAGE_RULES: Record<string, string> = {
  en: 'Reply in English.',
  hi: 'Reply in Hindi, written in Devanagari script (keep Article numbers and Act names as they are).',
  mr: 'Reply in Marathi, written in Devanagari script (keep Article numbers and Act names as they are).',
};

function buildUserPrompt(message: string, sources: Source[], language = 'auto'): string {
  const rule = LANGUAGE_RULES[language];
  const tail = rule ? `\n\nLANGUAGE INSTRUCTION (overrides any earlier language rule): ${rule} Write the follow-up questions in the same language.` : '';
  if (!sources.length) return message + tail;
  const block = sources
    .map((s) => `[${s.ref}${s.title ? ' - ' + s.title : ''}${s.part ? ' (' + s.part + ')' : ''}]\n${s.content}`)
    .join('\n\n');
  return `SOURCES (official text of Indian law from the database):\n${block}\n\nQUESTION:\n${message}${tail}`;
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
          generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
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
        max_tokens: 4096,
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


// Lists the chat models this key can really use (so we never depend on guessed model names).
const compatCache: Record<string, string[]> = {};
async function discoverCompat(base: string, key: string): Promise<string[]> {
  if (compatCache[base]) return compatCache[base];
  try {
    const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
    const d: any = await r.json();
    const ids: string[] = (d?.data ?? [])
      .map((m: any) => String(m?.id ?? ''))
      .filter((id: string) => id && !/whisper|tts|guard|embed|transcri|safeguard|orpheus|playai|moderation|compound|rerank|image|vision-preview/i.test(id));
    const rank = (id: string) => (/gpt-oss-120b|llama-3\.3-70b|qwen3?-?.*32b|maverick|kimi/i.test(id) ? 0 : /gpt-oss|llama|scout|qwen/i.test(id) ? 1 : 2);
    compatCache[base] = ids.sort((a, b) => rank(a) - rank(b)).slice(0, 6);
  } catch {
    compatCache[base] = [];
  }
  return compatCache[base];
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
        ...(/gpt-oss/i.test(model) ? { reasoning_effort: 'low' } : {}),
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

  // RAG: fetch relevant law text (Constitution + Acts) (never blocks the answer if it fails)
  const sources = await retrieveSources(message, token);
  const language = ['en', 'hi', 'mr'].includes(String(req.body?.language)) ? String(req.body.language) : 'auto';
  const prompt = buildUserPrompt(message, sources, language);
  const finish = () => {
    if (sources.length) {
      res.write(`\n\n---\n**Retrieved from official law text:** ${sources.map((x) => x.ref).join(', ')}`);
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

  // Gemini with automatic fallback to other Flash models (tried FIRST for Hindi/Marathi questions)
  let geminiTried = false;
  const runGemini = async (): Promise<boolean> => {
    if (!geminiKey) return false;
    geminiTried = true;
    const tried = new Set<string>();
    const primary = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
    const queue: string[] = [primary];
    let discovered = false;

    while (queue.length && tried.size < 4) {
      const model = queue.shift()!;
      if (tried.has(model)) continue;
      tried.add(model);

      const r = await streamGemini(model, geminiKey, prompt, res);
      if (r.ok || r.sent) {
        finish();
        return true;
      }
      note(`Gemini ${model}`, r.error);
      if (r.fatal) break;

      if (!queue.length && !discovered) {
        discovered = true;
        queue.push(...(await discoverFlashModels(geminiKey)));
      }
    }
    return false;
  };
  const nonEnglish =
    language === 'hi' ||
    language === 'mr' ||
    /[\u0900-\u097F]/.test(message) ||
    /\b(kay|kaay|aahe|ahe|mala|kayda|kanun|nahi|nahin|hai|mera|mujhe|kya|kaise|kasa|kashi|pati|patni|marhan)\b/i.test(message);
  // 1) Claude first, if a key is configured
  if (claudeKey) {
    const r = await streamClaude(process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', claudeKey, prompt, res);
    if (r.ok || r.sent) return finish();
    note('Claude', r.error);
  }

  // Hindi/Marathi: Gemini first (better than the small free models)
  if (nonEnglish && (await runGemini())) return;

  // 2) Groq (free, very fast), then 3) Cerebras (free, fast)
  const compat = [
    {
      label: 'Groq',
      base: 'https://api.groq.com/openai/v1',
      key: groqKey,
      models: [process.env.GROQ_MODEL, 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'],
    },
    {
      label: 'Cerebras',
      base: 'https://api.cerebras.ai/v1',
      key: cerebrasKey,
      models: [process.env.CEREBRAS_MODEL, 'gpt-oss-120b'],
    },
  ];
  for (const p of compat) {
    if (!p.key) continue;
    const tried = new Set<string>();
    const queue: string[] = p.models.filter((m): m is string => !!m);
    let discovered = false;
    let attempts = 0;
    while (queue.length && attempts < 4) {
      const m = queue.shift()!;
      if (tried.has(m)) continue;
      tried.add(m);
      attempts++;
      const r = await streamOpenAICompat(p.label, p.base, p.key, m, prompt, res);
      if (r.ok || r.sent) return finish();
      note(`${p.label} ${m}`, r.error);
      if (!queue.length && !discovered) {
        discovered = true;
        queue.push(...(await discoverCompat(p.base, p.key)));
      }
    }
  }

  // 4) Gemini (if not already tried above)
  if (!geminiTried && (await runGemini())) return;

  // Nothing worked
  res.removeHeader('Content-Type');
  const missing = [!groqKey && 'GROQ_API_KEY', !cerebrasKey && 'CEREBRAS_API_KEY'].filter(Boolean).join(', ');
  return res.status(502).json({
    error: `[api v5] ${errors.join(' | ') || lastError}${missing ? ` (not set: ${missing})` : ''}`,
  });
}