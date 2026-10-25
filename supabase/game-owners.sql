-- Every game belongs to the operator who created it (Pai 2026-10-25: "whatever login, I see everyone's games").
-- Run after supabase.sql, desktop-machines.sql and demo-account.sql. Safe to run again. Plain `language sql`.
--
-- game_keys.owner = the username whose session created the game (create_game). A session may run, share and
-- delete only its own games; the admin (operators.is_admin) every game; the demo login only "demo-…" games.
-- Watching stays public (/b, /o, /live), and a game's helper key (?k=) still runs that one game for anyone.
-- Games from before this file belong to the admin ("demo-…" ones to the demo login).
alter table public.game_keys add column if not exists owner text;

update public.game_keys set owner = case
    when id like 'demo-%' then (select username from public.operators where is_demo order by created_at limit 1)
    else (select username from public.operators where is_admin order by created_at limit 1) end
  where owner is null;

create or replace function public.operator_can(p_token text, p_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.operator_sessions s join public.operators o using (username)
    where s.token = p_token and s.expires_at > now()
      and (o.is_admin
           or (o.is_demo and coalesce(p_id, '') like 'demo-%')
           or (not o.is_demo and exists (select 1 from public.game_keys k where k.id = p_id and k.owner = o.username))
           -- a code nobody has yet: a new game this session may create
           or (not o.is_demo and not exists (select 1 from public.games g where g.id = p_id)))
  );
$$;

create or replace function public.create_game(p_id text, p_key text, p_state jsonb)
returns boolean language sql volatile security definer set search_path = public, extensions as $$
  with g as (
    insert into public.games (id, state)
    select p_id, p_state
    where public.operator_can(p_key, p_id) and not exists (select 1 from public.games where id = p_id)
    returning id
  ),
  k as (
    insert into public.game_keys (id, key, owner)
    select id, encode(gen_random_bytes(8), 'hex'), public.operator_whoami(p_key) from g
    returning id
  )
  select exists (select 1 from k)
$$;

-- the games this login may run (the /live page shows these when logged in)
create or replace function public.my_games(p_token text)
returns setof text language sql stable security definer set search_path = public as $$
  select g.id from public.games g where public.operator_can(p_token, g.id);
$$;

revoke all on function public.operator_can(text, text) from public;
grant execute on function public.operator_can(text, text) to anon, authenticated;
revoke all on function public.my_games(text) from public;
grant execute on function public.my_games(text) to anon, authenticated;
