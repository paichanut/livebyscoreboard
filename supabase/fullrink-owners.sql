-- Boards owned by a FullRink account (Keycloak at auth.fullrink.com, Pai 2026-11-07).
-- Run after supabase.sql and game-owners.sql, in Supabase → SQL Editor. Safe to run again. Plain `language sql`.
--
-- game_keys.owner_sub = the FullRink account (`sub` of its access token) that created the board through
-- /api/fullrink. It lives on the private game_keys row, not on the publicly readable games row, so nobody can
-- list who owns what. Boards made without signing in (operator login, helper key) keep owner_sub null and work
-- by link exactly as before. These functions are for the server only (service_role): /api/fullrink checks the
-- token's signature and issuer first, so a browser can never claim another account's sub.
alter table public.game_keys add column if not exists owner_sub text;
create index if not exists game_keys_owner_sub_idx on public.game_keys (owner_sub) where owner_sub is not null;

-- a new board owned by p_sub; returns its operator key, or null when the code is taken
create or replace function public.fullrink_create_game(p_id text, p_state jsonb, p_sub text)
returns text language sql volatile security definer set search_path = public, extensions as $$
  with g as (
    insert into public.games (id, state)
    select p_id, p_state
    where coalesce(p_sub, '') <> '' and p_id ~ '^[a-z0-9-]{1,32}$'
      and not exists (select 1 from public.games where id = p_id)
    returning id
  ),
  k as (
    insert into public.game_keys (id, key, owner_sub)
    select id, encode(gen_random_bytes(8), 'hex'), p_sub from g
    returning key
  )
  select key from k
$$;

-- the boards p_sub created, newest first (key included: the owner runs them from any device)
create or replace function public.fullrink_my_games(p_sub text)
returns table (id text, key text, title text, home text, away text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, k.key, g.state->'opts'->>'title', g.state->'home'->>'name', g.state->'away'->>'name', g.updated_at
  from public.game_keys k join public.games g on g.id = k.id
  where coalesce(p_sub, '') <> '' and k.owner_sub = p_sub
  order by g.updated_at desc
  limit 200
$$;

-- the operator key of one board, only for its owner
create or replace function public.fullrink_game_key(p_id text, p_sub text)
returns text language sql stable security definer set search_path = public as $$
  select k.key from public.game_keys k where k.id = p_id and coalesce(p_sub, '') <> '' and k.owner_sub = p_sub
$$;

revoke all on function public.fullrink_create_game(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.fullrink_my_games(text) from public, anon, authenticated;
revoke all on function public.fullrink_game_key(text, text) from public, anon, authenticated;
grant execute on function public.fullrink_create_game(text, jsonb, text) to service_role;
grant execute on function public.fullrink_my_games(text) to service_role;
grant execute on function public.fullrink_game_key(text, text) to service_role;

-- Server key variant (applied 2026-11-07 as migration fullrink_boards_server_key): without a service-role key the
-- server calls fullrink_*_k(p_key, ...) with the anon key plus Vercel env FULLRINK_BOARDS_KEY. Only the key's
-- SHA-256 lives in fullrink_private.server_key (schema not exposed by the API). To rotate: generate a new key,
-- set it in Vercel, then: update fullrink_private.server_key set sha256 = encode(extensions.digest('<new key>','sha256'),'hex');
create schema if not exists fullrink_private;
revoke all on schema fullrink_private from public, anon, authenticated;
create table if not exists fullrink_private.server_key (id int primary key default 1 check (id = 1), sha256 text not null);
revoke all on fullrink_private.server_key from public, anon, authenticated;
create or replace function fullrink_private.key_ok(p_key text)
returns boolean language sql stable security definer set search_path = fullrink_private, extensions as $$
  select exists (select 1 from fullrink_private.server_key where sha256 = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex'))
$$;
create or replace function public.fullrink_create_game_k(p_key text, p_id text, p_state jsonb, p_sub text)
returns text language sql volatile security definer set search_path = public, extensions as $$
  select case when fullrink_private.key_ok(p_key) then public.fullrink_create_game(p_id, p_state, p_sub) end
$$;
create or replace function public.fullrink_my_games_k(p_key text, p_sub text)
returns table (id text, key text, title text, home text, away text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select * from public.fullrink_my_games(p_sub) where fullrink_private.key_ok(p_key)
$$;
create or replace function public.fullrink_game_key_k(p_key text, p_id text, p_sub text)
returns text language sql stable security definer set search_path = public as $$
  select case when fullrink_private.key_ok(p_key) then public.fullrink_game_key(p_id, p_sub) end
$$;
revoke all on function public.fullrink_create_game_k(text, text, jsonb, text) from public;
revoke all on function public.fullrink_my_games_k(text, text) from public;
revoke all on function public.fullrink_game_key_k(text, text, text) from public;
grant execute on function public.fullrink_create_game_k(text, text, jsonb, text) to anon, service_role;
grant execute on function public.fullrink_my_games_k(text, text) to anon, service_role;
grant execute on function public.fullrink_game_key_k(text, text, text) to anon, service_role;
