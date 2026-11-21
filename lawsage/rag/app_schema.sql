-- LawSage: chat history + saved responses. Run once in Supabase SQL editor.

-- 1) messages (safe if it already exists)
create table if not exists public.messages (
  id         uuid primary key,
  content    text not null,
  role       text not null check (role in ('user','assistant')),
  created_at timestamptz not null default now(),
  session_id uuid not null
);
alter table public.messages add column if not exists user_id uuid default auth.uid() references auth.users(id) on delete cascade;
create index if not exists messages_user_session_idx on public.messages (user_id, session_id, created_at);

alter table public.messages enable row level security;
drop policy if exists "own messages select" on public.messages;
drop policy if exists "own messages insert" on public.messages;
drop policy if exists "own messages delete" on public.messages;
create policy "own messages select" on public.messages for select to authenticated using (user_id = auth.uid());
create policy "own messages insert" on public.messages for insert to authenticated with check (user_id = auth.uid());
create policy "own messages delete" on public.messages for delete to authenticated using (user_id = auth.uid());

-- Old rows saved before this change have user_id = null and stay invisible
-- (they can't be attributed to a user). Delete them if you want:
-- delete from public.messages where user_id is null;

-- 2) saved_responses
create table if not exists public.saved_responses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question   text,
  answer     text not null,
  session_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists saved_responses_user_idx on public.saved_responses (user_id, created_at desc);

alter table public.saved_responses enable row level security;
drop policy if exists "own saved select" on public.saved_responses;
drop policy if exists "own saved insert" on public.saved_responses;
drop policy if exists "own saved delete" on public.saved_responses;
create policy "own saved select" on public.saved_responses for select to authenticated using (user_id = auth.uid());
create policy "own saved insert" on public.saved_responses for insert to authenticated with check (user_id = auth.uid());
create policy "own saved delete" on public.saved_responses for delete to authenticated using (user_id = auth.uid());
