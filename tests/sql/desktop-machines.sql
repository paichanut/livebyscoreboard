-- Disposable database only: run after supabase.sql and supabase/desktop-machines.sql.
-- All fixtures roll back. psql -v ON_ERROR_STOP=1 ... < tests/sql/desktop-machines.sql
begin;
select public.set_operator('desktop-test-owner', 'fixture-password');
select public.set_operator('desktop-test-other', 'fixture-password');
insert into public.operator_sessions(token, username, expires_at) values
 ('fixture-owner', 'desktop-test-owner', now() + interval '1 hour'),
 ('fixture-other', 'desktop-test-other', now() + interval '1 hour'),
 ('fixture-expired', 'desktop-test-owner', now() - interval '1 hour');
insert into public.games (id, state) values ('taken-code', '{}');
set local role anon;
do $$
declare
  first jsonb;
  again jsonb;
  metadata jsonb;
  id uuid := '12345678-1234-1234-1234-123456789012';
begin
  assert public.desktop_machine_register('bad-token', id, 'arena-pc')->>'error' = 'login';
  assert public.desktop_machine_register('fixture-owner', id, 'x')->>'error' = 'invalid_machine';
  first := public.desktop_machine_register('fixture-owner', id, 'Arena-PC');
  assert first->>'username' = 'desktop-test-owner';
  assert first->>'code' = 'arena-pc';
  assert (first->>'created')::boolean, 'a name this account does not have yet is created';
  assert length(first->>'key') = 64;
  assert first->>'gameId' = 'arena-pc', 'the online game takes the machine name when that code is free';
  again := public.desktop_machine_register('fixture-owner', id, 'arena-pc');
  assert not (again->>'created')::boolean and again->>'key' = first->>'key', 're-pairing the same name keeps its key';
  assert (public.desktop_machine_register('fixture-owner', id, 'rink-two')->>'created')::boolean, 'a second name is a new address';
  assert public.desktop_machine_register('fixture-owner', id, 'taken-code')->>'gameId' ~ '^taken-code-[0-9a-f]{4}$', 'a used game code gets a suffix';
  assert not (public.desktop_machine_lookup('desktop-test-owner', 'arena-pc')->>'synced')::boolean;
  assert public.desktop_machine_lookup('desktop-test-owner', 'arena-pc') is not null, 'the first name stays';
  assert public.desktop_machine_register('fixture-other', '22345678-1234-1234-1234-123456789012', 'arena-pc')->>'code' = 'arena-pc', 'different accounts can use the same name';
  assert public.desktop_machine_lookup('desktop-test-other', 'arena-pc')->>'machineId' = '22345678-1234-1234-1234-123456789012';
  assert public.desktop_machine_lookup('desktop-test-owner', 'arena-pc')->>'machineId' = id::text, 'another account never takes this one';
  assert not public.desktop_machine_publish(id, 'wrong', first->>'nonce', 'https://fixture.trycloudflare.com');
  assert not public.desktop_machine_publish(id, first->>'key', first->>'nonce', 'https://evil.example');
  assert public.desktop_machine_publish(id, first->>'key', first->>'nonce', 'https://fixture.trycloudflare.com');
  metadata := public.desktop_machine_lookup('desktop-test-owner', 'arena-pc');
  assert metadata->>'url' = 'https://fixture.trycloudflare.com';
  assert not metadata ? 'key', 'public lookup must not expose the machine secret';
  assert public.desktop_machine_control('fixture-other', 'desktop-test-owner', 'arena-pc')->>'error' = 'forbidden';
  assert public.desktop_machine_control('fixture-expired', 'desktop-test-owner', 'arena-pc')->>'error' = 'login';
  assert public.desktop_machine_control('fixture-owner', 'desktop-test-owner', 'arena-pc')->>'key' = first->>'key';
  assert public.desktop_machine_control('fixture-owner', 'desktop-test-owner', 'missing')->>'error' = 'missing';
  assert public.desktop_machine_lookup('desktop-test-owner', 'missing') is null;
  assert public.desktop_machine_publish(id, first->>'key', repeat('b',32), '');
  assert public.desktop_machine_control('fixture-owner', 'desktop-test-owner', 'arena-pc')->>'nonce' = repeat('b',32);
  again := public.desktop_machine_register('fixture-owner', '32345678-1234-1234-1234-123456789012', 'arena-pc');
  assert (again->>'moved')::boolean and not (again->>'created')::boolean and again->>'key' <> first->>'key';
  assert again->>'gameId' = 'arena-pc', 'moving a name keeps its online game';
  assert public.desktop_machine_lookup('desktop-test-owner', 'arena-pc')->>'url' = '', 'a moved name waits for its new computer';
  assert not public.desktop_machine_publish(id, first->>'key', repeat('c',32), 'https://fixture.trycloudflare.com'), 'the old computer lost the name';
  assert public.desktop_machine_publish('32345678-1234-1234-1234-123456789012', again->>'key', repeat('c',32), 'https://next.trycloudflare.com');
  begin
    perform key from public.desktop_machines;
    raise exception 'anonymous table access was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.desktop_machines set owner_username = 'desktop-test-other';
    raise exception 'anonymous table update was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$$;
set local role authenticated;
do $$ begin
  begin
    perform key from public.desktop_machines;
    raise exception 'authenticated table access was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
