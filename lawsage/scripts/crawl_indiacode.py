#!/usr/bin/env python3
"""
India Code (DSpace 9 REST API) crawler: list Acts -> download PDFs -> parse + load into Supabase.
Resumable: re-run any step and it skips what is already done.

Setup:  pip install -r scripts/requirements.txt
Steps (run in this order, from the project folder):
  python scripts/crawl_indiacode.py list --limit 20          # test on 20 Acts first, writes data/index.json
  python scripts/crawl_indiacode.py list                      # all Acts of the collection
  python scripts/crawl_indiacode.py download --only "Domestic Violence"   # one Act (filter by title text)
  python scripts/crawl_indiacode.py download --limit 50       # first 50 not yet downloaded
  python scripts/crawl_indiacode.py ingest --embed --limit 50 # parse + embed + upsert (needs SUPABASE_*/GEMINI_API_KEY env)
  python scripts/crawl_indiacode.py ingest --dry-run          # parse only, writes out/*.csv, no upload

--collection UUID : the Acts collection. Default = Central Acts (from indiacode.gov.in/collections/<uuid>).
                    For a State's Acts, open that State's Acts collection page and copy the uuid from the URL.
Be polite: default 1.5 s between requests. Read the site's Terms of use before bulk downloading.
Logs: data/needs_ocr.txt (PDFs with no text), data/parse_failed.txt (no sections found).
"""
import argparse, json, os, re, sys, time
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ingest_act as ia  # noqa: E402

BASE = os.environ.get("INDIACODE_API", "https://indiacode.gov.in/server/api")
CENTRAL_ACTS = "69a0c1fb-7b22-4481-b16a-1dc59b5d02e6"
UA = {"User-Agent": "lawsage-crawler/1.0 (research; contact: set-your-email)"}
DATA = "data"
INDEX = os.path.join(DATA, "index.json")
DONE = os.path.join(DATA, "ingested.json")
DELAY = 1.5

# Acts the chatbot knows by short code (api/chat.ts ACT_ALIASES). Match = lowercase substring of the title.
KNOWN = [
    ("bharatiya nyaya sanhita", "bns", "BNS"),
    ("bharatiya nagarik suraksha sanhita", "bnss", "BNSS"),
    ("bharatiya sakshya adhiniyam", "bsa", "BSA"),
    ("indian penal code", "ipc", "IPC"),
    ("code of criminal procedure, 1973", "crpc", "CrPC"),
    ("indian evidence act", "iea", "Evidence Act"),
    ("protection of women from domestic violence act", "pwdva", "PWDVA 2005"),
    ("right to information act", "rti", "RTI Act 2005"),
]

def get(url, **kw):
    for attempt in range(6):
        try:
            r = requests.get(url, headers=UA, timeout=60, **kw)
        except requests.RequestException as e:
            print("  network error, retrying:", e); time.sleep(5 * (attempt + 1)); continue
        if r.status_code in (429, 502, 503, 504):
            time.sleep(10 * (attempt + 1)); continue
        r.raise_for_status()
        time.sleep(DELAY)
        return r
    raise RuntimeError(f"giving up on {url}")

def md(item, key):
    v = (item.get("metadata") or {}).get(key) or []
    return v[0].get("value", "") if v else ""

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:90]

def load(path, default):
    return json.load(open(path, encoding="utf-8")) if os.path.exists(path) else default

def save(path, obj):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    json.dump(obj, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ------------------------------------------------------------------ list
def cmd_list(a):
    items, page = [], 0
    while True:
        d = get(f"{BASE}/discover/search/objects", params={
            "scope": a.collection, "dsoType": "ITEM", "size": 100, "page": page}).json()
        res = d["_embedded"]["searchResult"]
        for o in res["_embedded"]["objects"]:
            it = o["_embedded"]["indexableObject"]
            items.append({"uuid": it["uuid"], "title": it.get("name") or md(it, "dc.title"),
                          "date": md(it, "dc.date.issued"), "meta": {k: v[0].get("value") for k, v in (it.get("metadata") or {}).items() if v}})
        total = res["page"]["totalPages"]
        print(f"page {page + 1}/{total}: {len(items)} Acts so far")
        page += 1
        if page >= total or (a.limit and len(items) >= a.limit):
            break
    if a.limit:
        items = items[:a.limit]
    save(INDEX, items)
    print(f"wrote {INDEX} ({len(items)} Acts). Example:", json.dumps(items[0], ensure_ascii=False)[:400] if items else "none")

# ------------------------------------------------------------------ download
def pdf_path(it):
    return os.path.join(DATA, "pdf", f"{slug(it['title'])}-{it['uuid'][:8]}.pdf")

def cmd_download(a):
    items = load(INDEX, [])
    if not items:
        sys.exit("Run the 'list' step first.")
    todo = [i for i in items if (not a.only or a.only.lower() in i["title"].lower()) and not os.path.exists(pdf_path(i))]
    if a.limit:
        todo = todo[:a.limit]
    os.makedirs(os.path.join(DATA, "pdf"), exist_ok=True)
    for n, it in enumerate(todo, 1):
        try:
            bundles = get(f"{BASE}/core/items/{it['uuid']}/bundles").json()["_embedded"]["bundles"]
            orig = next((b for b in bundles if b.get("name") == "ORIGINAL"), bundles[0] if bundles else None)
            if not orig:
                print(f"[{n}/{len(todo)}] no files: {it['title']}"); continue
            bits = get(f"{BASE}/core/bundles/{orig['uuid']}/bitstreams").json()["_embedded"]["bitstreams"]
            bit = next((b for b in bits if b.get("name", "").lower().endswith(".pdf")), bits[0] if bits else None)
            if not bit:
                print(f"[{n}/{len(todo)}] no pdf: {it['title']}"); continue
            data = get(f"{BASE}/core/bitstreams/{bit['uuid']}/content").content
            open(pdf_path(it), "wb").write(data)
            print(f"[{n}/{len(todo)}] {it['title']}  ({len(data)//1024} KB)")
        except Exception as e:  # keep going; re-run later to retry
            print(f"[{n}/{len(todo)}] FAILED {it['title']}: {e}")

# ------------------------------------------------------------------ ingest
def code_for(title):
    t = title.lower()
    for needle, code, short in KNOWN:
        if needle in t:
            return code, short
    base = re.sub(r"^the\s+", "", title.strip(), flags=re.I)
    return slug(base)[:60], base[:70]

def cmd_ingest(a):
    items = load(INDEX, [])
    done = load(DONE, {})
    todo = [i for i in items if os.path.exists(pdf_path(i)) and i["uuid"] not in done
            and (not a.only or a.only.lower() in i["title"].lower())]
    if a.limit:
        todo = todo[:a.limit]
    total_rows = 0
    for n, it in enumerate(todo, 1):
        text = ia.read_text(pdf_path(it))
        if len(text.strip()) < 500:
            open(os.path.join(DATA, "needs_ocr.txt"), "a", encoding="utf-8").write(it["title"] + "\n")
            print(f"[{n}/{len(todo)}] NO TEXT (scanned?): {it['title']}"); continue
        secs = ia.parse_sections(ia.clean_lines(text))
        code, short = code_for(it["title"])
        rows = ia.build_rows(secs, code, short, it["title"], it.get("date") and f"Enacted {it['date']}")
        if not rows:
            open(os.path.join(DATA, "parse_failed.txt"), "a", encoding="utf-8").write(it["title"] + "\n")
            print(f"[{n}/{len(todo)}] PARSE FAILED: {it['title']}"); continue
        print(f"[{n}/{len(todo)}] {it['title']}: {len(secs)} sections -> {len(rows)} rows (code {code})")
        if a.dry_run:
            continue
        if a.embed:
            ia.add_embeddings(rows)
        ia.upsert("law_chunks", rows, "ref_key")
        done[it["uuid"]] = code
        save(DONE, done)
        total_rows += len(rows)
    print(f"done. rows loaded this run: {total_rows}")

def main():
    global DELAY
    ap = argparse.ArgumentParser()
    ap.add_argument("step", choices=["list", "download", "ingest"])
    ap.add_argument("--collection", default=CENTRAL_ACTS)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--only", default="")
    ap.add_argument("--embed", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--delay", type=float, default=1.5)
    a = ap.parse_args()
    DELAY = a.delay
    {"list": cmd_list, "download": cmd_download, "ingest": cmd_ingest}[a.step](a)

if __name__ == "__main__":
    main()
