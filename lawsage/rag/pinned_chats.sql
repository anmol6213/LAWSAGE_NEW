-- 3) pinned_chats (Pin icon in chat sidebar)
create table if not exists public.pinned_chats (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, session_id)
);

alter table public.pinned_chats enable row level security;
drop policy if exists "own pins select" on public.pinned_chats;
drop policy if exists "own pins insert" on public.pinned_chats;
drop policy if exists "own pins delete" on public.pinned_chats;
create policy "own pins select" on public.pinned_chats for select to authenticated using (user_id = auth.uid());
create policy "own pins insert" on public.pinned_chats for insert to authenticated with check (user_id = auth.uid());
create policy "own pins delete" on public.pinned_chats for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.pinned_chats to authenticated;
notify pgrst, 'reload schema';
