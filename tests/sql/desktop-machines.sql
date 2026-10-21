-- Disposable database only: run after supabase.sql and supabase/desktop-machines.sql.
-- All fixtures roll back. psql -v ON_ERROR_STOP=1 ... < tests/sql/desktop-machines.sql
begin;
select public.set_operator('desktop-test-owner', 'fixture-password');
select public.set_operator('desktop-test-other', 'fixture-password');
insert into public.operator_sessions(token, username, expires_at) values
 ('fixture-owner', 'desktop-test-owner', now() + interval '1 hour'),
 ('fixture-other', 'desktop-test-other', now() + interval '1 hour'),
 ('fixture-expired', 'desktop-test-owner', now() - interval '1 hour');
set local role anon;
do $$
declare
  first jsonb;
  again jsonb;
  metadata jsonb;
  id uuid := '12345678-1234-1234-1234-123456789012';
begin
  assert public.desktop_machine_register('bad-token', id, 'arena-pc')->>'error' = 'login';
  first := public.desktop_machine_register('fixture-owner', id, 'arena-pc');
  assert first->>'username' = 'desktop-test-owner';
  assert length(first->>'key') = 64;
  again := public.desktop_machine_register('fixture-owner', id, 'renamed-pc');
  assert again = first, 're-pair preserves the installation name and key';
  assert public.desktop_machine_register('fixture-other', id, 'arena-pc')->>'error' = 'forbidden';
  assert public.desktop_machine_register('fixture-owner', '22345678-1234-1234-1234-123456789012', 'arena-pc')->>'error' = 'machine_in_use';
  assert public.desktop_machine_register('fixture-other', '22345678-1234-1234-1234-123456789012', 'arena-pc')->>'code' = 'arena-pc', 'different accounts can use the same name';
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
  begin
    perform key from public.desktop_machines;
    raise exception 'anonymous table access was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.desktop_machines set owner_username = 'desktop-test-other' where machine_id = id;
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
