#!/usr/bin/env python3
"""
Retrieval test: for each question in tests/questions.json, check that an expected ref_key shows up in the top results.
Run after every data/prompt change:   python scripts/eval_rag.py [--k 5]
Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY (optional; without it only keyword search is tested)
NOTE: the "expect" lists are starting guesses - verify them against the Act text you loaded, then fix any that are wrong.
Also use the printed sim values to tune RAG_MIN_SIM in Vercel (default 0.45).
"""
import argparse, json, os, sys
import requests

SB_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL") or "").rstrip("/")
SB_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
MODEL = os.environ.get("GEMINI_EMBED_MODEL", "gemini-embedding-001")

def embed(q):
    if not GEMINI_KEY:
        return None
    r = requests.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:embedContent",
        headers={"x-goog-api-key": GEMINI_KEY},
        json={"model": f"models/{MODEL}", "content": {"parts": [{"text": q}]},
              "taskType": "RETRIEVAL_QUERY", "outputDimensionality": 768}, timeout=30)
    r.raise_for_status()
    return r.json()["embedding"]["values"]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--k", type=int, default=5)
    ap.add_argument("--file", default="tests/questions.json")
    a = ap.parse_args()
    if not (SB_URL and SB_KEY):
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_KEY")
    cases = json.load(open(a.file, encoding="utf-8"))
    passed = 0
    for c in cases:
        r = requests.post(f"{SB_URL}/rest/v1/rpc/search_law_v2",
                          headers={"apikey": SB_KEY, "Authorization": f"Bearer {SB_KEY}"},
                          json={"q": c["q"], "qe": embed(c["q"]), "n": a.k}, timeout=60)
        if not r.ok:
            sys.exit(f"search failed: {r.status_code} {r.text[:200]}")
        rows = r.json()
        keys = [x["ref_key"] for x in rows]
        ok = any(e in keys for e in c["expect"])
        passed += ok
        print(("PASS " if ok else "FAIL ") + c["q"])
        for x in rows:
            sim = "-" if x["sim"] is None else f"{x['sim']:.2f}"
            print(f"      {x['ref_key']:<12} sim={sim:<5} strict={'Y' if x['strict_hit'] else 'n'}  {(x['title'] or '')[:60]}")
    print(f"\n{passed}/{len(cases)} passed")

if __name__ == "__main__":
    main()
