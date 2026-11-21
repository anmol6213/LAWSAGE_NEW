# LawSage RAG upgrade - steps

1. **Database**: Supabase -> SQL Editor -> run `rag/acts_schema.sql` (safe to re-run; Constitution rows are kept).
2. **Python deps**: `pip install -r scripts/requirements.txt`
   Env (terminal only, never in git): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GEMINI_API_KEY`
3. **Get Acts**: download from indiacode.nic.in into `data/` - BNS, BNSS, BSA, PWDVA 2005, RTI Act 2005 first.
4. **Dry-run each Act** and open `out/<act>.csv` to spot-check (section count, titles, no merged sections; read the WARNING about missing numbers):
   ```
   python scripts/ingest_act.py --act pwdva --short "PWDVA 2005" --name "Protection of Women from Domestic Violence Act, 2005" --file data/pwdva.pdf --dry-run
   ```
5. **Load for real** (same command, replace `--dry-run` with `--embed`). Suggested codes: `bns` `bnss` `bsa` `pwdva` `rti`.
6. **Embed the Constitution rows**: `python scripts/ingest_act.py --backfill-embeddings`
7. **IPC -> BNS mapping**: build a CSV (`old_act,old_section,new_act,new_section,note`) from the official MHA comparison table, then
   `python scripts/ingest_act.py --load-mapping data/ipc_to_bns.csv` (old_act: ipc / crpc / iea).
8. **Deploy `api/chat.ts`** (replace the file) and keep `GEMINI_API_KEY` set in Vercel (used for query embeddings).
   Optional Vercel env: `RAG_MIN_SIM` (default 0.45), `RAG_MAX_SOURCES` (default 6), `GEMINI_EMBED_MODEL`.
9. **Test**: `python scripts/eval_rag.py` - fix failing cases (check expected refs, data, or `RAG_MIN_SIM`). Re-run after every change.
10. **Adding another Act**: ingest it (steps 4-5) and add an alias line in `ACT_ALIASES` in `api/chat.ts`.
    When an Act is amended, download the new text and re-run the same ingest command (it updates rows by `ref_key`).

## Bulk load from India Code (crawler)
Instead of downloading PDFs by hand (steps 3-5), use `scripts/crawl_indiacode.py` (DSpace REST API, resumable). Run from the project folder:
```
python scripts/crawl_indiacode.py list --limit 20                  # test run, writes data/index.json
python scripts/crawl_indiacode.py download --only "Domestic Violence"
python scripts/crawl_indiacode.py ingest --only "Domestic Violence" --dry-run   # then check out/*.csv
python scripts/crawl_indiacode.py ingest --only "Domestic Violence" --embed
```
Then widen: `list` (all), `download --limit 50`, `ingest --embed --limit 50`, repeat in batches.
- Logs: `data/needs_ocr.txt` (scanned PDFs, no text), `data/parse_failed.txt` (no sections found).
- State Acts: open a State's Acts collection on indiacode.gov.in, copy the uuid from the URL, pass `--collection <uuid>`.
- Check the site's Terms of use first; keep the default 1.5 s delay. Watch Supabase free-tier size (500 MB).
- Acts with a code in `KNOWN` (bns, bnss, bsa, ipc, crpc, iea, pwdva, rti) work with exact "section N" lookup; all others are found by search.
