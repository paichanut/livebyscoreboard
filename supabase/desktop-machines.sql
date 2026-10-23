-- Permanent desktop addresses: https://livebyscoreboard.vercel.app/b|c|o/<username>/<machine>.
-- Run after supabase.sql (SQL Editor, or the Supabase MCP). Safe to run again.
-- Separate from games/game_keys: ordinary operators cannot read another machine's key.
-- Plain `language sql` on purpose (plpgsql bodies time out through the Supabase MCP connector).
--
-- One row per account + machine name. A machine name works like a game code (Pai 2026-10-23): typing a name
-- this account doesn't have yet creates it; typing one it already has moves that address to this computer
-- (a new key, so the computer that had it before stops publishing to it). machine_id = the computer that
-- holds the name now (its installation UUID in share.json). game_id = the online game the desktop copies its
-- game to (save_game/create_game with the operator session): the machine name when that game code is free,
-- else the name + 4 hex; it never changes, so /live and /b/<game_id> stay the same for this name.
begin;

create table if not exists public.desktop_machines (
  owner_username text not null references public.operators(username) on delete cascade,
  machine text not null check (machine ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  machine_id uuid not null,
  key text not null,
  nonce text not null,
  url text not null default '',
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (owner_username, machine)
);
create index if not exists desktop_machines_machine_id on public.desktop_machines (machine_id);
-- the online copy of this machine's game (public.games id), made on the first registration (Pai 2026-10-23)
alter table public.desktop_machines add column if not exists game_id text unique;
alter table public.desktop_machines enable row level security;
revoke all on public.desktop_machines from public, anon, authenticated;

-- an earlier draft took (token, machine_id, machine) with a different meaning; same signature, replaced here
drop function if exists public.desktop_machine_register(text, uuid, text);
create function public.desktop_machine_register(p_token text, p_machine_id uuid, p_machine text)
returns jsonb language sql volatile security definer set search_path = public, extensions as $$
  with acct as (select public.operator_whoami(p_token) as u),
  req as (
    select acct.u, lower(trim(p_machine)) as m from acct
    where acct.u is not null and p_machine_id is not null and lower(trim(coalesce(p_machine, ''))) ~ '^[a-z0-9][a-z0-9-]{2,39}$'
  ),
  had as (select d.machine_id from public.desktop_machines d join req on d.owner_username = req.u and d.machine = req.m),
  up as (
    insert into public.desktop_machines as d (owner_username, machine, machine_id, key, nonce, game_id)
    select u, m, p_machine_id, encode(gen_random_bytes(32), 'hex'), encode(gen_random_bytes(16), 'hex'),
      case when not exists (select 1 from public.games g where g.id = left(m, 32))
            and not exists (select 1 from public.desktop_machines x where x.game_id = left(m, 32))
        then left(m, 32) else left(m, 27) || '-' || encode(gen_random_bytes(2), 'hex') end
    from req
    on conflict (owner_username, machine) do update set
      machine_id = excluded.machine_id,
      game_id = coalesce(d.game_id, excluded.game_id),
      key = case when d.machine_id = excluded.machine_id then d.key else excluded.key end,
      nonce = case when d.machine_id = excluded.machine_id then d.nonce else excluded.nonce end,
      url = case when d.machine_id = excluded.machine_id then d.url else '' end,
      seen_at = case when d.machine_id = excluded.machine_id then d.seen_at end
    returning d.*
  )
  select case
    when (select u from acct) is null then jsonb_build_object('error', 'login')
    when not exists (select 1 from req) then jsonb_build_object('error', 'invalid_machine')
    else (select jsonb_build_object('version', 2, 'machineId', machine_id, 'username', owner_username, 'code', machine,
      'key', key, 'nonce', nonce, 'gameId', game_id, 'created', not exists (select 1 from had),
      'moved', exists (select 1 from had where had.machine_id <> p_machine_id)) from up)
  end;
$$;

-- Public, read-only metadata for the display and banner. Never includes the private key.
create or replace function public.desktop_machine_lookup(p_username text, p_machine text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('version', 2, 'machineId', machine_id, 'username', owner_username,
    'machine', machine, 'nonce', nonce, 'url', url, 'seenAt', extract(epoch from seen_at) * 1000,
    'gameId', game_id, 'synced', exists (select 1 from public.games g where g.id = d.game_id))
  from public.desktop_machines d
  where owner_username = lower(trim(p_username)) and machine = lower(trim(p_machine));
$$;

-- Only the computer holding the name (its private key) can publish its tunnel or rotate its controller nonce.
create or replace function public.desktop_machine_publish(p_machine_id uuid, p_key text, p_nonce text, p_url text)
returns boolean language sql volatile security definer set search_path = public as $$
  with u as (
    update public.desktop_machines set nonce = p_nonce, url = p_url, seen_at = now()
    where machine_id = p_machine_id and key = p_key
      and p_nonce ~ '^[0-9a-f]{32}$' and p_url is not null
      and (p_url = '' or p_url ~ '^https://[a-z0-9-]+\.trycloudflare\.com/?$')
    returning 1
  )
  select exists (select 1 from u);
$$;

-- Owner check is inside the database as well as the API, including when called directly.
create or replace function public.desktop_machine_control(p_token text, p_username text, p_machine text)
returns jsonb language sql stable security definer set search_path = public as $$
  with acct as (select public.operator_whoami(p_token) as u)
  select case
    when (select u from acct) is null then jsonb_build_object('error', 'login')
    when (select u from acct) <> lower(trim(p_username)) then jsonb_build_object('error', 'forbidden')
    else coalesce((select public.desktop_machine_lookup(d.owner_username, d.machine) || jsonb_build_object('key', d.key)
      from public.desktop_machines d, acct where d.owner_username = acct.u and d.machine = lower(trim(p_machine))),
      jsonb_build_object('error', 'missing'))
  end;
$$;

revoke all on function public.desktop_machine_register(text, uuid, text),
  public.desktop_machine_lookup(text, text), public.desktop_machine_publish(uuid, text, text, text),
  public.desktop_machine_control(text, text, text) from public;
grant execute on function public.desktop_machine_register(text, uuid, text),
  public.desktop_machine_lookup(text, text), public.desktop_machine_publish(uuid, text, text, text),
  public.desktop_machine_control(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
