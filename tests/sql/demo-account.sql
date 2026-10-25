-- Disposable database only: run after supabase.sql, supabase/desktop-machines.sql, supabase/demo-account.sql and supabase/game-owners.sql.
-- All fixtures roll back. psql -v ON_ERROR_STOP=1 ... < tests/sql/demo-account.sql
begin;
select public.set_operator('demo-fixture', 'demo');
select public.set_operator('real-fixture', 'secret');
update public.operators set is_demo = true where username = 'demo-fixture';
insert into public.operator_sessions(token, username, expires_at) values
 ('demo-token', 'demo-fixture', now() + interval '1 hour'),
 ('real-token', 'real-fixture', now() + interval '1 hour');
insert into public.games (id, state) values ('tournament-a', '{"home":{"score":1}}');
insert into public.game_keys (id, key, owner) values ('tournament-a', 'helper-key', 'real-fixture');
insert into public.teams (name, color, logo, uploaded_by) values ('Fixture Bears', '#123456', '', 'real-fixture');
select set_config('test.team', (select id::text from public.teams where name = 'Fixture Bears'), true);
set local role anon;
do $$
begin
  -- a demo login never reaches a real game
  assert not public.check_key('tournament-a', 'demo-token');
  assert not public.save_game('tournament-a', 'demo-token', '{"home":{"score":99}}');
  assert public.get_game_key('tournament-a', 'demo-token') is null;
  assert not public.delete_game('tournament-a', 'demo-token');
  assert not public.create_game('my-game', 'demo-token', '{}');
  -- ...but runs its own demo-… games end to end
  assert public.create_game('demo-trial', 'demo-token', '{}');
  assert public.check_key('demo-trial', 'demo-token');
  assert public.save_game('demo-trial', 'demo-token', '{"home":{"score":2}}');
  assert public.get_game_key('demo-trial', 'demo-token') is not null;
  assert public.delete_game('demo-trial', 'demo-token');
  -- the shared team library and desktop machine names stay out of reach
  assert public.team_save('demo-token', 'Demo Team', '#ff0000', '') = 'login';
  assert public.team_update('demo-token', current_setting('test.team')::uuid, 'Hacked', '', '') = 'denied';
  assert not public.team_delete('demo-token', current_setting('test.team')::uuid);
  assert public.desktop_machine_register('demo-token', '12345678-1234-1234-1234-123456789012', 'demo-pc')->>'error' = 'forbidden';
  -- real operators are unchanged
  assert public.check_key('tournament-a', 'real-token');
  assert public.save_game('tournament-a', 'real-token', '{"home":{"score":2}}');
  assert public.create_game('my-game', 'real-token', '{}');
  assert public.check_key('tournament-a', 'helper-key'), 'single-game helper keys still work';
  assert public.desktop_machine_register('real-token', '12345678-1234-1234-1234-123456789012', 'real-pc')->>'code' = 'real-pc';
end;
$$;
rollback;
