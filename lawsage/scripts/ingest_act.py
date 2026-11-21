#!/usr/bin/env python3
"""
Load an Indian Act into Supabase (table public.law_chunks), one row per section, with embeddings.

Setup:   pip install requests pypdf
Env:     SUPABASE_URL            e.g. https://xxxx.supabase.co
         SUPABASE_SERVICE_KEY    service_role key (server-side only, never commit it)
         GEMINI_API_KEY          for embeddings (free tier is enough)
Usage:
  # 1) check the parser first (writes out/<act>.csv, touches nothing)
  python scripts/ingest_act.py --act pwdva --short "PWDVA 2005" \
      --name "Protection of Women from Domestic Violence Act, 2005" --file data/pwdva.pdf --dry-run
  # 2) real load (add --embed for vector search)
  python scripts/ingest_act.py --act pwdva --short "PWDVA 2005" \
      --name "Protection of Women from Domestic Violence Act, 2005" --file data/pwdva.pdf --embed
  # 3) give the existing Constitution rows embeddings too
  python scripts/ingest_act.py --backfill-embeddings
  # 4) old->new section mapping (CSV columns: old_act,old_section,new_act,new_section,note)
  python scripts/ingest_act.py --load-mapping data/ipc_to_bns.csv

Act codes used by the API (api/chat.ts): bns bnss bsa ipc crpc iea pwdva rti ...
Get the text from India Code (indiacode.nic.in). Always read the dry-run CSV before loading.
"""
import argparse, csv, hashlib, json, os, re, sys, time
import requests

SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "").rstrip("/")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
EMBED_MODEL = os.environ.get("GEMINI_EMBED_MODEL", "gemini-embedding-001")
DIM = 768
MAX_CHUNK = 3200

# ---------------------------------------------------------------- reading
def read_text(path):
    if path.lower().endswith(".pdf"):
        from pypdf import PdfReader
        return "\n".join((p.extract_text() or "") for p in PdfReader(path).pages)
    with open(path, encoding="utf-8") as f:
        return f.read()

JUNK = re.compile(r"^\s*(THE GAZETTE OF INDIA|REGISTERED NO|भारत का राजपत्र|\[?PART II|MINISTRY OF LAW)", re.I)

def clean_lines(text):
    out = []
    for l in text.replace("\u00a0", " ").replace("\r", "").split("\n"):
        l = l.rstrip()
        if re.fullmatch(r"\s*\d{1,3}\s*", l):      # bare page number
            continue
        if JUNK.match(l):
            continue
        out.append(l)
    return out

# ---------------------------------------------------------------- parsing
SEC = re.compile(r"^\s*(\d{1,3})([A-Z]{0,2})\.\s*(.*)$")
CHAP = re.compile(r"^\s*CHAPTER\s+([IVXLCDM]+|\d+[A-Z]?)\b[\s.:\-–—]*(.*)$", re.I)
TITLE_SPLIT = re.compile(r"^([^()]{3,200}?)\.\s*[—–\-]+\s*(.*)$")
PARA_START = re.compile(r"^\s*(\(\w{1,4}\)|Explanation|Illustration|Provided|Exception|Note)\b")

def accept(base, suf, last_base, last_suf):
    if last_base is None:
        return base == 1 and suf == ""
    if base == last_base and suf and suf > last_suf:
        return True                                   # 12A after 12, 12B after 12A
    if suf == "" and last_base < base <= last_base + 3:
        return True                                   # next section (allows a few omitted numbers)
    return False

def run_parse(lines, start):
    secs, cur = [], None
    last_base, last_suf = None, ""
    part = ""
    for k in range(max(0, start - 4), start):          # chapter heading just above the first section
        c0 = CHAP.match(lines[k])
        if c0:
            t0 = c0.group(2).strip() or (lines[k + 1].strip() if k + 1 < start and lines[k + 1].strip().isupper() else "")
            part = f"Chapter {c0.group(1).upper()}" + (f" - {t0.title()}" if t0 else "")
    i = start
    while i < len(lines):
        line = lines[i]
        ch = CHAP.match(line)
        if ch and len(line) < 140:
            title = ch.group(2).strip()
            if not title:
                j = i + 1
                while j < len(lines) and not lines[j].strip():
                    j += 1
                if j < len(lines) and lines[j].strip().isupper() and len(lines[j]) < 120:
                    title = lines[j].strip()
                    i = j
            part = f"Chapter {ch.group(1).upper()}" + (f" - {title.title()}" if title else "")
            i += 1
            continue
        m = SEC.match(line)
        if m:
            base, suf, rest = int(m.group(1)), m.group(2), m.group(3).strip()
            if accept(base, suf, last_base, last_suf):
                if cur:
                    secs.append(cur)
                title, body = "", rest
                t = TITLE_SPLIT.match(rest)
                if t and not t.group(1).lstrip().startswith("("):
                    title, body = t.group(1).strip(), t.group(2).strip()
                else:                                  # modern layout: heading is the line above
                    k = i - 1
                    while k >= 0 and not lines[k].strip():
                        k -= 1
                    if k >= 0:
                        prev = lines[k].strip()
                        if len(prev) <= 100 and not prev.endswith((":", ";", ",")) and not CHAP.match(prev):
                            title = prev.rstrip(".")
                cur = {"num": f"{base}{suf}", "title": title, "part": part, "lines": [body] if body else []}
                last_base, last_suf = base, suf
                i += 1
                continue
        if cur is not None and line.strip():
            cur["lines"].append(line.strip())
        i += 1
    if cur:
        secs.append(cur)
    return secs

def parse_sections(lines):
    """Try every '1.' as the start (table of contents vs real body); keep the run with most real sections."""
    starts = [i for i, l in enumerate(lines) if re.match(r"^\s*1\.\s*\S", l)][:8] or [0]
    best, best_score = [], -1
    for s in starts:
        secs = run_parse(lines, s)
        score = sum(1 for x in secs if len(" ".join(x["lines"])) > 80)
        if score > best_score:
            best, best_score = secs, score
    return best

def join_lines(lines):
    out = ""
    for l in lines:
        if not out:
            out = l
        elif PARA_START.match(l):
            out += "\n" + l
        else:
            out += " " + l
    return re.sub(r"[ \t]+", " ", out).strip()

def split_long(text):
    if len(text) <= MAX_CHUNK:
        return [text]
    chunks, buf = [], ""
    for para in text.split("\n"):
        if buf and len(buf) + len(para) + 1 > MAX_CHUNK:
            chunks.append(buf)
            buf = para
        else:
            buf = f"{buf}\n{para}" if buf else para
    if buf:
        chunks.append(buf)
    return chunks

def build_rows(secs, act, short, name, notes):
    rows = []
    for s in secs:
        text = join_lines(s["lines"])
        if len(text) < 20 or re.match(r"^\[?\s*(Omitted|Repealed)", text, re.I):
            continue
        for k, chunk in enumerate(split_long(text), 1):
            key = f"{act}:{s['num'].upper()}" + ("" if k == 1 else f"#{k}")
            ref = f"{short} s.{s['num']}" + ("" if k == 1 else f" (part {k})")
            rows.append({
                "source": name, "act": act, "ref": ref, "ref_key": key,
                "title": s["title"], "part": s["part"], "content": chunk, "notes": notes or None,
            })
    return rows

# ---------------------------------------------------------------- embeddings
CACHE_FILE = os.path.join("data", "embed_cache.json")
BATCH = 10          # small batches stay under Gemini's per-minute token limit
PAUSE = 4           # seconds between batches

def _load_cache():
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _save_cache(c):
    os.makedirs("data", exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(c, f)

def embed_batch(texts):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:batchEmbedContents"
    body = {"requests": [{
        "model": f"models/{EMBED_MODEL}", "content": {"parts": [{"text": t}]},
        "taskType": "RETRIEVAL_DOCUMENT", "outputDimensionality": DIM} for t in texts]}
    last = ""
    for attempt in range(8):
        r = requests.post(url, json=body, headers={"x-goog-api-key": GEMINI_KEY}, timeout=60)
        if r.status_code == 429 or r.status_code >= 500:
            last = f"{r.status_code} {r.text[:300]}"
            wait = 15 * (attempt + 1)
            print(f"  Gemini says {r.status_code}, waiting {wait}s (try {attempt + 1}/8)")
            time.sleep(wait)
            continue
        r.raise_for_status()
        return [e["values"] for e in r.json()["embeddings"]]
    raise RuntimeError(f"embedding failed after retries. Last response: {last}")

def embed_text(row):
    return f"{row['ref']}. {row.get('title') or ''}. {row.get('part') or ''}. {row['content'][:1800]}"

def add_embeddings(rows):
    """Embeds rows in small batches. Finished vectors are saved to data/embed_cache.json,
    so if this stops (rate limit, network), just run the same command again and it resumes."""
    if not GEMINI_KEY:
        sys.exit("GEMINI_API_KEY is not set")
    cache = _load_cache()
    todo = []
    for r in rows:
        t = embed_text(r)
        k = hashlib.sha1(t.encode("utf-8")).hexdigest()
        r["_k"], r["_t"] = k, t
        if k in cache:
            r["embedding"] = cache[k]
        else:
            todo.append(r)
    print(f"  {len(rows) - len(todo)} cached, {len(todo)} to embed")
    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        vecs = embed_batch([r["_t"] for r in batch])
        for r, v in zip(batch, vecs):
            r["embedding"] = v
            cache[r["_k"]] = v
        _save_cache(cache)
        print(f"  embedded {min(i + BATCH, len(todo))}/{len(todo)}")
        time.sleep(PAUSE)
    for r in rows:
        r.pop("_k", None)
        r.pop("_t", None)

# ---------------------------------------------------------------- supabase
def sb_headers(extra=None):
    h = {"apikey": SB_KEY, "Content-Type": "application/json"}
    if not SB_KEY.startswith("sb_"):          # new-style keys (sb_secret_...) are not JWTs: apikey header only
        h["Authorization"] = f"Bearer {SB_KEY}"
    h.update(extra or {})
    return h

def upsert(table, rows, conflict):
    if not (SB_URL and SB_KEY):
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_KEY")
    for i in range(0, len(rows), 50):
        r = requests.post(f"{SB_URL}/rest/v1/{table}?on_conflict={conflict}", json=rows[i:i + 50],
                          headers=sb_headers({"Prefer": "resolution=merge-duplicates,return=minimal"}), timeout=120)
        if not r.ok:
            sys.exit(f"upsert failed: {r.status_code} {r.text[:300]}")
    print(f"upserted {len(rows)} rows into {table}")

def backfill_embeddings():
    total = 0
    while True:
        r = requests.get(f"{SB_URL}/rest/v1/law_chunks?select=source,act,ref,ref_key,title,part,content,notes&embedding=is.null&order=id&limit=100",
                         headers=sb_headers(), timeout=60)
        r.raise_for_status()
        rows = r.json()
        if not rows:
            break
        add_embeddings(rows)
        upsert("law_chunks", rows, "ref_key")
        total += len(rows)
    print(f"backfilled {total} rows")

# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--act"); ap.add_argument("--short"); ap.add_argument("--name")
    ap.add_argument("--file"); ap.add_argument("--notes", default="")
    ap.add_argument("--embed", action="store_true"); ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--backfill-embeddings", action="store_true")
    ap.add_argument("--load-mapping")
    a = ap.parse_args()

    if a.backfill_embeddings:
        return backfill_embeddings()
    if a.load_mapping:
        with open(a.load_mapping, encoding="utf-8") as f:
            rows = [{k: (v or "").strip().upper() if k.endswith("section") else (v or "").strip().lower() if k.endswith("act") else (v or "").strip()
                     for k, v in r.items()} for r in csv.DictReader(f)]
        return upsert("law_mapping", rows, "old_act,old_section,new_act,new_section")

    if not (a.act and a.short and a.name and a.file):
        ap.error("--act, --short, --name and --file are required")
    secs = parse_sections(clean_lines(read_text(a.file)))
    rows = build_rows(secs, a.act.lower(), a.short, a.name, a.notes)
    print(f"parsed {len(secs)} sections -> {len(rows)} rows")
    nums = sorted({int(re.match(r"\d+", x["num"]).group()) for x in secs})
    gaps = [n for n in range(1, (nums[-1] if nums else 0) + 1) if n not in nums]
    if gaps:
        print(f"WARNING: section numbers not found (omitted in the Act, or the parser missed them): {gaps[:40]}")
    if rows:
        print("first:", rows[0]["ref"], "|", rows[0]["title"], "|", rows[0]["content"][:80])
        print("last: ", rows[-1]["ref"], "|", rows[-1]["title"], "|", rows[-1]["content"][:80])
    os.makedirs("out", exist_ok=True)
    with open(f"out/{a.act}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["ref_key", "ref", "title", "part", "content"], extrasaction="ignore")
        w.writeheader(); w.writerows(rows)
    print(f"wrote out/{a.act}.csv  (open it and spot-check before loading)")
    if a.dry_run:
        return
    if a.embed:
        add_embeddings(rows)
    upsert("law_chunks", rows, "ref_key")

if __name__ == "__main__":
    main()