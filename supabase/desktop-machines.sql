-- Run once in Supabase SQL Editor after supabase.sql. Safe to run again.
-- Separate from games/game_keys: ordinary operators cannot read another machine's key.
begin;

create table if not exists public.desktop_machines (
  machine_id uuid primary key,
  owner_username text not null references public.operators(username) on delete cascade,
  machine text not null check (machine ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  key text not null,
  nonce text not null,
  url text not null default '',
  seen_at timestamptz,
  unique (owner_username, machine)
);
alter table public.desktop_machines enable row level security;
revoke all on public.desktop_machines from public, anon, authenticated;

create or replace function public.desktop_machine_register(p_token text, p_machine_id uuid, p_machine text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  account text := public.operator_whoami(p_token);
  code text := lower(trim(p_machine));
  device public.desktop_machines;
begin
  if account is null then return jsonb_build_object('error', 'login'); end if;
  if p_machine_id is null or code is null or code !~ '^[a-z0-9][a-z0-9-]{2,39}$' then
    return jsonb_build_object('error', 'invalid_machine');
  end if;
  select * into device from public.desktop_machines where machine_id = p_machine_id for update;
  if found then
    if device.owner_username <> account then return jsonb_build_object('error', 'forbidden'); end if;
  else
    begin
      insert into public.desktop_machines (machine_id, owner_username, machine, key, nonce)
      values (p_machine_id, account, code, encode(gen_random_bytes(32), 'hex'), encode(gen_random_bytes(16), 'hex'))
      returning * into device;
    exception when unique_violation then
      return jsonb_build_object('error', 'machine_in_use');
    end;
  end if;
  return jsonb_build_object('version', 2, 'machineId', device.machine_id, 'username', device.owner_username,
    'code', device.machine, 'key', device.key, 'nonce', device.nonce);
end;
$$;

-- Public, read-only metadata for the display and banner. Never includes the private key.
create or replace function public.desktop_machine_lookup(p_username text, p_machine text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('version', 2, 'machineId', machine_id, 'username', owner_username,
    'machine', machine, 'nonce', nonce, 'url', url, 'seenAt', extract(epoch from seen_at) * 1000)
  from public.desktop_machines
  where owner_username = lower(trim(p_username)) and machine = lower(trim(p_machine));
$$;

-- Only the paired desktop's private key can publish or rotate its controller nonce.
create or replace function public.desktop_machine_publish(p_machine_id uuid, p_key text, p_nonce text, p_url text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_nonce is null or p_nonce !~ '^[0-9a-f]{32}$' or p_url is null
     or (p_url <> '' and p_url !~ '^https://[a-z0-9-]+\.trycloudflare\.com/?$') then
    return false;
  end if;
  update public.desktop_machines set nonce = p_nonce, url = p_url, seen_at = now()
  where machine_id = p_machine_id and key = p_key;
  return found;
end;
$$;

-- Owner check is inside the database as well as the API, including when called directly.
create or replace function public.desktop_machine_control(p_token text, p_username text, p_machine text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  account text := public.operator_whoami(p_token);
  device public.desktop_machines;
begin
  if account is null then return jsonb_build_object('error', 'login'); end if;
  if account <> lower(trim(p_username)) then return jsonb_build_object('error', 'forbidden'); end if;
  select * into device from public.desktop_machines
  where owner_username = account and machine = lower(trim(p_machine));
  if not found then return jsonb_build_object('error', 'missing'); end if;
  return public.desktop_machine_lookup(account, device.machine) || jsonb_build_object('key', device.key);
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
