-- Run once in Supabase → SQL Editor. Safe to re-run.
--
-- Security model:
--   * anyone can READ any game (public display / banner links)
--   * WRITES go only through save_game(id, key, state); the key is stored in a
--     separate table nobody can read, so the public link is truly read-only.

create table if not exists public.games (
  id text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.game_keys (
  id text primary key references public.games(id) on delete cascade,
  key text not null
);

alter table public.games enable row level security;
alter table public.game_keys enable row level security;  -- no policies = nobody can read keys

-- clean up policies from the first version
drop policy if exists "public read"   on public.games;
drop policy if exists "public insert" on public.games;
drop policy if exists "public update" on public.games;

create policy "public read" on public.games for select using (true);

-- Create a game with its operator key. Returns false if the code is taken.
create or replace function public.create_game(p_id text, p_key text, p_state jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.games where id = p_id) then return false; end if;
  insert into public.games (id, state) values (p_id, p_state);
  insert into public.game_keys (id, key) values (p_id, p_key);
  return true;
end $$;

-- Save state; only succeeds with the right key.
create or replace function public.save_game(p_id text, p_key text, p_state jsonb)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.games g set state = p_state, updated_at = now()
  where g.id = p_id and exists (select 1 from public.game_keys k where k.id = p_id and k.key = p_key);
  return found;
end $$;

-- Check a key without changing anything (used by the control page on open).
create or replace function public.check_key(p_id text, p_key text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from public.game_keys where id = p_id and key = p_key);
$$;

-- Server time in ms. Every device measures its offset to this so clocks agree even when a
-- phone's or TV's system time is wrong. (Without it the app falls back to the HTTP Date header.)
create or replace function public.server_now()
returns bigint language sql stable as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

grant execute on function public.server_now() to anon, authenticated;
grant execute on function public.create_game(text, text, jsonb) to anon, authenticated;
grant execute on function public.save_game(text, text, jsonb) to anon, authenticated;
grant execute on function public.check_key(text, text) to anon, authenticated;

-- Realtime for row changes
do $$ begin
  alter publication supabase_realtime add table public.games;
exception when duplicate_object then null; end $$;
