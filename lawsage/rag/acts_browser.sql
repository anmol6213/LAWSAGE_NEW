-- LawSage: Central Acts + State Acts pages. Run ONCE in Supabase -> SQL Editor. Safe to re-run.

-- 1) Which jurisdiction does a row belong to? Existing rows (Constitution, BNS, PWDVA) are 'central'.
alter table public.law_chunks add column if not exists jurisdiction text not null default 'central';
create index if not exists law_chunks_jur_idx on public.law_chunks (jurisdiction, act);

-- 2) List of Acts for one jurisdiction (Constitution 'coi' has its own page, so it is left out)
create or replace function public.list_acts(j text default 'central')
returns table (act text, source text, sections bigint, notes text)
language sql stable
as $$
  select c.act,
         min(c.source),
         count(distinct split_part(c.ref_key, '#', 1)),
         min(c.notes)
  from public.law_chunks c
  where c.act <> 'coi' and c.jurisdiction = j
  group by c.act
  order by min(c.source);
$$;
grant execute on function public.list_acts(text) to authenticated;

-- 3) States that have at least one Act loaded (fills the State dropdown)
create or replace function public.list_state_jurisdictions()
returns table (jurisdiction text, acts bigint)
language sql stable
as $$
  select c.jurisdiction, count(distinct c.act)
  from public.law_chunks c
  where c.jurisdiction <> 'central'
  group by c.jurisdiction
  order by c.jurisdiction;
$$;
grant execute on function public.list_state_jurisdictions() to authenticated;
