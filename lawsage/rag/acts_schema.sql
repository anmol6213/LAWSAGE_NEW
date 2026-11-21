-- LawSage RAG upgrade: Constitution + Acts, hybrid (keyword + vector) search.
-- Run ONCE in Supabase -> SQL Editor. Safe to re-run. Existing Constitution rows are kept (act = 'coi').

create extension if not exists vector;

-- 1) New columns on the existing table
alter table public.law_chunks add column if not exists act        text        not null default 'coi';
alter table public.law_chunks add column if not exists updated_at timestamptz not null default now();
alter table public.law_chunks add column if not exists embedding  vector(768);

create index if not exists law_chunks_act_idx on public.law_chunks (act);
create index if not exists law_chunks_embedding_idx on public.law_chunks using hnsw (embedding vector_cosine_ops);

-- 2) Rebuild the keyword column so the Act name is searchable too
drop index if exists public.law_chunks_fts_idx;
alter table public.law_chunks drop column if exists fts;
alter table public.law_chunks add column fts tsvector generated always as (
  setweight(to_tsvector('english', coalesce(ref,'') || ' ' || coalesce(title,'')), 'A') ||
  setweight(to_tsvector('english', coalesce(source,'') || ' ' || coalesce(part,'')), 'C') ||
  setweight(to_tsvector('english', coalesce(content,'')), 'B')
) stored;
create index law_chunks_fts_idx on public.law_chunks using gin (fts);

-- 3) Old IPC / CrPC / Evidence Act  ->  BNS / BNSS / BSA mapping (load from the official comparison table)
create table if not exists public.law_mapping (
  old_act     text not null,   -- ipc | crpc | iea
  old_section text not null,   -- e.g. 498A
  new_act     text not null,   -- bns | bnss | bsa
  new_section text not null,   -- e.g. 85
  note        text,
  primary key (old_act, old_section, new_act, new_section)
);
alter table public.law_mapping enable row level security;
drop policy if exists "authenticated can read law_mapping" on public.law_mapping;
create policy "authenticated can read law_mapping" on public.law_mapping for select to authenticated using (true);
grant select on public.law_mapping to authenticated;

-- 4) Hybrid search: keyword rank + vector rank, fused with Reciprocal Rank Fusion.
--    q  = English keywords (or the question), qe = query embedding (768-d, optional), acts = optional filter e.g. {'pwdva','bns'}
--    sim = cosine similarity (null if no embedding), strict_hit = ALL keywords matched
create or replace function public.search_law_v2(
  q text,
  qe vector(768) default null,
  n int default 8,
  acts text[] default null
)
returns table (ref_key text, ref text, title text, part text, content text, act text, sim real, strict_hit boolean, score real)
language sql stable
as $$
  with p as (
    select plainto_tsquery('english', coalesce(q,'')) as strict,
           to_tsquery('english', nullif(regexp_replace(btrim(regexp_replace(lower(coalesce(q,'')), '[^a-z0-9 ]', ' ', 'g')), '\s+', ' | ', 'g'), '')) as loose
  ),
  f as (
    select id, row_number() over (order by rk desc) as r
    from (
      select c.id,
             ( 8 * (to_tsvector('english', coalesce(c.title,'')) @@ p.strict)::int
             + 4 * (c.fts @@ p.strict)::int
             + ts_rank(c.fts, p.loose, 1) ) as rk
      from public.law_chunks c, p
      where c.fts @@ p.loose and (acts is null or c.act = any(acts))
      order by rk desc
      limit 40
    ) x
  ),
  v as (
    select id, row_number() over (order by d) as r
    from (
      select c.id, c.embedding <=> qe as d
      from public.law_chunks c
      where qe is not null and c.embedding is not null and (acts is null or c.act = any(acts))
      order by c.embedding <=> qe
      limit 40
    ) x
  ),
  m as (
    select id, sum(1.0 / (60 + r)) as s
    from (select id, r from f union all select id, r from v) u
    group by id
  )
  select c.ref_key, c.ref, c.title, c.part, c.content, c.act,
         case when qe is not null and c.embedding is not null then (1 - (c.embedding <=> qe))::real end as sim,
         coalesce(c.fts @@ p.strict, false) as strict_hit,
         m.s::real as score
  from m
  join public.law_chunks c on c.id = m.id
  cross join p
  order by m.s desc
  limit least(greatest(n, 1), 20);
$$;

grant execute on function public.search_law_v2(text, vector, int, text[]) to authenticated;
