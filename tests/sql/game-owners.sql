-- Disposable database only: run after supabase.sql, supabase/desktop-machines.sql, supabase/demo-account.sql
-- and supabase/game-owners.sql. All fixtures roll back. psql -v ON_ERROR_STOP=1 ... < tests/sql/game-owners.sql
begin;
select public.set_operator('owner-a', 'secret');
select public.set_operator('owner-b', 'secret');
select public.set_operator('owner-admin', 'secret');
update public.operators set is_admin = true where username = 'owner-admin';
insert into public.operator_sessions(token, username, expires_at) values
 ('token-a', 'owner-a', now() + interval '1 hour'),
 ('token-b', 'owner-b', now() + interval '1 hour'),
 ('token-admin', 'owner-admin', now() + interval '1 hour');
set local role anon;
do $$
begin
  assert public.create_game('fixture-a', 'token-a', '{"home":{"score":0}}');
  assert public.create_game('fixture-b', 'token-b', '{"home":{"score":0}}');
  -- each login runs only its own games
  assert public.check_key('fixture-a', 'token-a');
  assert not public.check_key('fixture-a', 'token-b'), 'someone else''s game is locked';
  assert not public.save_game('fixture-a', 'token-b', '{"home":{"score":9}}');
  assert public.get_game_key('fixture-a', 'token-b') is null;
  assert not public.delete_game('fixture-a', 'token-b');
  assert not public.create_game('fixture-a', 'token-b', '{}'), 'a taken code stays taken';
  assert 'fixture-a' in (select public.my_games('token-a'));
  assert 'fixture-b' not in (select public.my_games('token-a'));
  -- the admin runs every game
  assert public.check_key('fixture-b', 'token-admin');
  assert 'fixture-a' in (select public.my_games('token-admin')) and 'fixture-b' in (select public.my_games('token-admin'));
  -- the helper key still runs that one game without a login
  assert public.check_key('fixture-a', public.get_game_key('fixture-a', 'token-a'));
  assert public.save_game('fixture-a', 'token-a', '{"home":{"score":1}}');
  assert public.delete_game('fixture-a', 'token-a');
end;
$$;
rollback;
