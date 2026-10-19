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

-- ---------------------------------------------------------------------------
-- Operator login: username + password. Log in once on any device, then create
-- and edit any game. Per-game operator links (?k=) keep working for helpers.
--   * password hashes and sessions live in tables nobody can read (RLS, no policies)
--   * add an operator or change a password in the SQL editor (logs that user out):
--       select public.set_operator('name', 'password');
--   * remove one:  delete from public.operators where username = 'name';
--   * a wrong password costs 1 s, and there is no lockout a stranger could trigger
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.operators (
  username text primary key,
  pw_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.operator_sessions (
  token text primary key,
  username text not null references public.operators(username) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
alter table public.operators enable row level security;
alter table public.operator_sessions enable row level security;

create or replace function public.set_operator(p_username text, p_password text)
returns void language sql security definer set search_path = public, extensions as $$
  with up as (
    insert into public.operators (username, pw_hash)
    values (lower(trim(p_username)), crypt(p_password, gen_salt('bf')))
    on conflict (username) do update set pw_hash = excluded.pw_hash
    returning username
  )
  delete from public.operator_sessions s using up where s.username = up.username
$$;
revoke execute on function public.set_operator(text, text) from public, anon, authenticated;

create or replace function public.operator_check(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.operator_sessions where token = p_token and expires_at > now());
$$;

create or replace function public.operator_login(p_username text, p_password text)
returns text language sql volatile security definer set search_path = public, extensions as $$
  with ok as (
    select username from public.operators
    where username = lower(trim(coalesce(p_username, '')))
      and pw_hash = crypt(coalesce(p_password, ''), pw_hash)
  ),
  slow as (select pg_sleep(1) where not exists (select 1 from ok)),
  cleanup as (delete from public.operator_sessions where expires_at < now()),
  ins as (
    insert into public.operator_sessions (token, username, expires_at)
    select encode(gen_random_bytes(24), 'hex'), username, now() + interval '30 days' from ok
    returning token
  )
  select (select token from ins) from (select count(*) from slow) x
$$;

create or replace function public.operator_logout(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.operator_sessions where token = p_token;
$$;

create or replace function public.operator_whoami(p_token text)
returns text language sql stable security definer set search_path = public as $$
  select username from public.operator_sessions where token = p_token and expires_at > now();
$$;

-- Only a logged-in operator can create a game; the game gets its own random key
-- so the operator can still hand a single-game link to a helper.
create or replace function public.create_game(p_id text, p_key text, p_state jsonb)
returns boolean language sql volatile security definer set search_path = public, extensions as $$
  with g as (
    insert into public.games (id, state)
    select p_id, p_state
    where public.operator_check(p_key) and not exists (select 1 from public.games where id = p_id)
    returning id
  ),
  k as (
    insert into public.game_keys (id, key)
    select id, encode(gen_random_bytes(8), 'hex') from g
    returning id
  )
  select exists (select 1 from k)
$$;

-- p_key is either the game's own key or an operator session token
create or replace function public.save_game(p_id text, p_key text, p_state jsonb)
returns boolean language sql volatile security definer set search_path = public as $$
  with u as (
    update public.games g set state = p_state, updated_at = now()
    where g.id = p_id
      and (public.operator_check(p_key)
           or exists (select 1 from public.game_keys k where k.id = p_id and k.key = p_key))
    returning 1
  )
  select exists (select 1 from u)
$$;

create or replace function public.check_key(p_id text, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.games where id = p_id)
     and (public.operator_check(p_key)
          or exists (select 1 from public.game_keys where id = p_id and key = p_key))
$$;

-- The single-game operator link, for a logged-in operator to share
create or replace function public.get_game_key(p_id text, p_token text)
returns text language sql security definer set search_path = public as $$
  select k.key from public.game_keys k where k.id = p_id and public.operator_check(p_token);
$$;

grant execute on function public.operator_check(text) to anon, authenticated;
grant execute on function public.operator_login(text, text) to anon, authenticated;
grant execute on function public.operator_logout(text) to anon, authenticated;
grant execute on function public.operator_whoami(text) to anon, authenticated;
grant execute on function public.get_game_key(text, text) to anon, authenticated;

-- Delete a game (operators only). Its key goes with it (on delete cascade).
create or replace function public.delete_game(p_id text, p_token text)
returns boolean language sql volatile security definer set search_path = public as $$
  with d as (delete from public.games where id = p_id and public.operator_check(p_token) returning id)
  select exists (select 1 from d)
$$;
revoke all on function public.delete_game(text, text) from public;
grant execute on function public.delete_game(text, text) to anon, authenticated;

-- ---------- Shared team library (every operator's teams, one list for everybody) ----------
-- Anyone can read it (the display / desktop app pick teams from it); a logged-in operator adds teams;
-- the uploader edits their own; an admin (operators.is_admin, i.e. paichanut) can edit or replace any
-- logo, e.g. to fix one without a transparent background. The uploader is only shown masked ("pa*******").
alter table public.operators add column if not exists is_admin boolean not null default false;
update public.operators set is_admin = true where username = 'paichanut';

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 40),
  color text not null default '#888888',
  logo text not null default '',
  uploaded_by text references public.operators(username) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists teams_name_key on public.teams (lower(trim(name)));
alter table public.teams enable row level security; -- no direct access: RPCs only (they mask the uploader)

create or replace function public.mask_name(p text)
returns text language sql immutable as $$
  select case when p is null then '' else left(p, 2) || repeat('*', greatest(length(p) - 2, 0)) end;
$$;

-- p_token may be null (not logged in): can_edit is then false everywhere
create or replace function public.team_list(p_token text)
returns table (id uuid, name text, color text, logo text, uploader text, mine boolean, can_edit boolean, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (
    select s.username, o.is_admin from public.operator_sessions s join public.operators o using (username)
    where s.token = p_token and s.expires_at > now()
  )
  select t.id, t.name, t.color, t.logo, public.mask_name(t.uploaded_by),
         coalesce(t.uploaded_by = (select username from me), false),
         coalesce((select is_admin from me), false) or coalesce(t.uploaded_by = (select username from me), false),
         t.updated_at
  from public.teams t
  order by lower(t.name);
$$;

-- Add a team, or update it (same name) when it is yours or you are admin. An empty logo/color keeps the old one.
-- Returns 'added' | 'updated' | 'taken' (someone else's team) | 'login' (no valid session)
create or replace function public.team_save(p_token text, p_name text, p_color text, p_logo text)
returns text language sql volatile security definer set search_path = public as $$
  with me as (
    select s.username, o.is_admin from public.operator_sessions s join public.operators o using (username)
    where s.token = p_token and s.expires_at > now()
  ),
  cur as (select * from public.teams where lower(trim(name)) = lower(trim(p_name))),
  ins as (
    insert into public.teams (name, color, logo, uploaded_by)
    select trim(p_name), coalesce(nullif(p_color, ''), '#888888'), coalesce(p_logo, ''), me.username from me
    where not exists (select 1 from cur) and length(trim(coalesce(p_name, ''))) > 0
    returning 'added'::text as r
  ),
  upd as (
    update public.teams t set color = coalesce(nullif(p_color, ''), t.color), logo = coalesce(nullif(p_logo, ''), t.logo), updated_at = now()
    from me where lower(trim(t.name)) = lower(trim(p_name)) and (t.uploaded_by = me.username or me.is_admin)
    returning 'updated'::text as r
  )
  select coalesce((select r from ins), (select r from upd),
                  case when not exists (select 1 from me) then 'login' else 'taken' end);
$$;

-- Rename / recolor / replace the logo of a team by id (yours, or any if admin). Null or '' keeps a field.
-- Returns 'updated' | 'denied'
create or replace function public.team_update(p_token text, p_id uuid, p_name text, p_color text, p_logo text)
returns text language sql volatile security definer set search_path = public as $$
  with me as (
    select s.username, o.is_admin from public.operator_sessions s join public.operators o using (username)
    where s.token = p_token and s.expires_at > now()
  ),
  upd as (
    update public.teams t set name = coalesce(nullif(trim(p_name), ''), t.name), color = coalesce(nullif(p_color, ''), t.color),
      logo = coalesce(nullif(p_logo, ''), t.logo), updated_at = now()
    from me where t.id = p_id and (t.uploaded_by = me.username or me.is_admin)
    returning 1
  )
  select case when exists (select 1 from upd) then 'updated' else 'denied' end;
$$;

create or replace function public.team_delete(p_token text, p_id uuid)
returns boolean language sql volatile security definer set search_path = public as $$
  with me as (
    select s.username, o.is_admin from public.operator_sessions s join public.operators o using (username)
    where s.token = p_token and s.expires_at > now()
  ),
  d as (delete from public.teams t using me where t.id = p_id and (t.uploaded_by = me.username or me.is_admin) returning 1)
  select exists (select 1 from d);
$$;

revoke all on function public.team_list(text), public.team_save(text, text, text, text),
  public.team_update(text, uuid, text, text, text), public.team_delete(text, uuid) from public;
grant execute on function public.team_list(text), public.team_save(text, text, text, text),
  public.team_update(text, uuid, text, text, text), public.team_delete(text, uuid) to anon, authenticated;
