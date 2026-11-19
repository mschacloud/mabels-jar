-- Mabel's Jar: database setup. Paste all of this into Supabase > SQL Editor > New query, then press Run.
-- Safe to run more than once.

-- Starters (Mabel, and any future starters or other people's starters)
create table if not exists public.starters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  born timestamptz,
  feed_time text default '17:00',
  to_confirm jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Journal entries: feeds, rise checks, notes
create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  starter_id uuid not null references public.starters(id) on delete cascade,
  type text not null check (type in ('feed','check','note')),
  at timestamptz not null,
  time_known boolean not null default true,
  estimate boolean not null default false,
  starter int, ap int, ww int, gf int, water int,
  level text, fell boolean, liquid boolean, bubbles text, top text,
  smells text[] not null default '{}',
  note text,
  photos jsonb not null default '[]'::jsonb,   -- [{ "path": "<user id>/<file>.jpg" }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists entries_starter_at on public.entries (starter_id, at);
-- Used by the one-time history import so running it twice never duplicates entries
alter table public.entries add column if not exists source_id text;
create unique index if not exists entries_user_source on public.entries (user_id, source_id);

-- Let signed-in people use these tables through the API (row level security below still limits them to their own rows).
-- Signed-out visitors get nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.starters, public.entries to authenticated;
revoke all on public.starters, public.entries from anon;

-- Only you can see and change your own rows
alter table public.starters enable row level security;
alter table public.entries  enable row level security;

drop policy if exists "own starters" on public.starters;
create policy "own starters" on public.starters for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Private photo storage: each person gets a folder named after their user id
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "own photos read"   on storage.objects;
drop policy if exists "own photos write"  on storage.objects;
drop policy if exists "own photos update" on storage.objects;
drop policy if exists "own photos delete" on storage.objects;
create policy "own photos read" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos write" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
