-- A public demo login (Pai 2026-10-24: "user demo : demo" for the IIHF / association presentation).
-- Run after supabase.sql (and desktop-machines.sql). Safe to run again. Plain `language sql` on purpose.
--
-- A demo operator (operators.is_demo) logs in like anyone else, but may only create, run, share and delete games
-- whose code starts with "demo-" (Home adds the prefix for it). It never reaches a real game, never changes the
-- shared team library and never registers a desktop machine name. Create / reset the account in the SQL editor:
--   select public.set_operator('demo', 'demo'); update public.operators set is_demo = true where username = 'demo';
alter table public.operators add column if not exists is_demo boolean not null default false;

-- may this session work on this game? every operator: any game; a demo operator: only "demo-…" games
create or replace function public.operator_can(p_token text, p_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.operator_sessions s join public.operators o using (username)
    where s.token = p_token and s.expires_at > now() and (not o.is_demo or coalesce(p_id, '') like 'demo-%')
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
    insert into public.game_keys (id, key)
    select id, encode(gen_random_bytes(8), 'hex') from g
    returning id
  )
  select exists (select 1 from k)
$$;

create or replace function public.save_game(p_id text, p_key text, p_state jsonb)
returns boolean language sql volatile security definer set search_path = public as $$
  with u as (
    update public.games g set state = p_state, updated_at = now()
    where g.id = p_id
      and (public.operator_can(p_key, p_id)
           or exists (select 1 from public.game_keys k where k.id = p_id and k.key = p_key))
    returning 1
  )
  select exists (select 1 from u)
$$;

create or replace function public.check_key(p_id text, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.games where id = p_id)
     and (public.operator_can(p_key, p_id)
          or exists (select 1 from public.game_keys where id = p_id and key = p_key))
$$;

create or replace function public.get_game_key(p_id text, p_token text)
returns text language sql security definer set search_path = public as $$
  select k.key from public.game_keys k where k.id = p_id and public.operator_can(p_token, p_id);
$$;

create or replace function public.delete_game(p_id text, p_token text)
returns boolean language sql volatile security definer set search_path = public as $$
  with d as (delete from public.games where id = p_id and public.operator_can(p_token, p_id) returning id)
  select exists (select 1 from d)
$$;

-- shared team library: a demo operator reads it like everyone, but adds / changes / deletes nothing
create or replace function public.team_save(p_token text, p_name text, p_color text, p_logo text)
returns text language sql volatile security definer set search_path = public as $$
  with me as (
    select s.username, o.is_admin from public.operator_sessions s join public.operators o using (username)
    where s.token = p_token and s.expires_at > now() and not o.is_demo
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

create or replace function public.team_update(p_token text, p_id uuid, p_name text, p_color text, p_logo text)
returns text language sql volatile security definer set search_path = public as $$
  with me as (
    select s.username, o.is_admin from public.operator_sessions s join public.operators o using (username)
    where s.token = p_token and s.expires_at > now() and not o.is_demo
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
    where s.token = p_token and s.expires_at > now() and not o.is_demo
  ),
  d as (delete from public.teams t using me where t.id = p_id and (t.uploaded_by = me.username or me.is_admin) returning 1)
  select exists (select 1 from d);
$$;

-- desktop permanent links: not for the demo login (its online game could not be saved anyway)
create or replace function public.desktop_machine_register(p_token text, p_machine_id uuid, p_machine text)
returns jsonb language sql volatile security definer set search_path = public, extensions as $$
  with acct as (select public.operator_whoami(p_token) as u),
  demo as (select exists (select 1 from public.operators o, acct where o.username = acct.u and o.is_demo) as yes),
  req as (
    select acct.u, lower(trim(p_machine)) as m from acct, demo
    where acct.u is not null and not demo.yes and p_machine_id is not null
      and lower(trim(coalesce(p_machine, ''))) ~ '^[a-z0-9][a-z0-9-]{2,39}$'
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
    when (select yes from demo) then jsonb_build_object('error', 'forbidden')
    when not exists (select 1 from req) then jsonb_build_object('error', 'invalid_machine')
    else (select jsonb_build_object('version', 2, 'machineId', machine_id, 'username', owner_username, 'code', machine,
      'key', key, 'nonce', nonce, 'gameId', game_id, 'created', not exists (select 1 from had),
      'moved', exists (select 1 from had where had.machine_id <> p_machine_id)) from up)
  end;
$$;

revoke all on function public.operator_can(text, text) from public;
grant execute on function public.operator_can(text, text) to anon, authenticated;
notify pgrst, 'reload schema';
