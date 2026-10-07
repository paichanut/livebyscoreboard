-- Run this once in Supabase → SQL Editor.
create table if not exists public.games (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.games enable row level security;

-- Simple open policies: anyone with the anon key can read/write any game.
-- Fine for a rink scoreboard; tighten later if you need to.
create policy "public read"   on public.games for select using (true);
create policy "public insert" on public.games for insert with check (true);
create policy "public update" on public.games for update using (true);

-- Enable realtime broadcasting of row changes.
alter publication supabase_realtime add table public.games;
