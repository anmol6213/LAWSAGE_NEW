-- LawSage RAG: Constitution of India
create table if not exists public.law_chunks (
  id        bigint generated always as identity primary key,
  source    text not null,
  ref       text not null,
  ref_key   text not null unique,
  title     text,
  part      text,
  content   text not null,
  notes     text,
  fts       tsvector generated always as (
              setweight(to_tsvector('english', coalesce(ref,'') || ' ' || coalesce(title,'')), 'A') ||
              setweight(to_tsvector('english', coalesce(part,'')), 'C') ||
              setweight(to_tsvector('english', coalesce(content,'')), 'B')
            ) stored
);

create index if not exists law_chunks_fts_idx on public.law_chunks using gin (fts);

alter table public.law_chunks enable row level security;

create policy "authenticated can read law_chunks"
  on public.law_chunks for select
  to authenticated
  using (true);

grant select on public.law_chunks to authenticated;

-- Keyword search. q = plain keywords, e.g. 'freedom of speech and expression'
create or replace function public.search_law(q text, n int default 6)
returns table (ref text, title text, part text, content text, rank real)
language sql stable
as $$
  with p as (
    select plainto_tsquery('english', q) as strict,
           to_tsquery('english', nullif(regexp_replace(btrim(regexp_replace(lower(q), '[^a-z0-9 ]', ' ', 'g')), '\s+', ' | ', 'g'), '')) as loose
  )
  select c.ref, c.title, c.part, c.content,
         ( 8 * (to_tsvector('english', coalesce(c.title,'')) @@ p.strict)::int
         + 4 * (c.fts @@ p.strict)::int
         + 3 * ts_rank(to_tsvector('english', coalesce(c.title,'')), p.loose)
         + ts_rank(c.fts, p.loose, 1) )::real as rank
  from public.law_chunks c, p
  where c.fts @@ p.loose
  order by rank desc
  limit least(greatest(n, 1), 12);
$$;

grant execute on function public.search_law(text, int) to authenticated;
