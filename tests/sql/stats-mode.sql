-- Disposable test database only. Fixtures roll back.
begin;
select public.set_operator('stats-test','fixture-password');
insert into public.operator_sessions(token,username,expires_at)values('stats-token','stats-test',now()+interval '1 hour');
insert into public.games(id,state)values('stats-test-game','{"home":{"score":1},"events":[]}');
set local role anon;
do $$
declare base jsonb := '{"home":{"score":1},"events":[]}'; result jsonb;
begin
 assert public.stats_sync_ready();
 assert public.save_game_checked('stats-test-game','wrong',base,'{}')->>'error'='locked';
 result:=public.save_game_checked('stats-test-game','stats-token',base,'{"home":{"score":2},"events":[{"id":"goal"}]}');
 assert (result->>'ok')::boolean;
 result:=public.save_game_checked('stats-test-game','stats-token',base,'{"home":{"score":99}}');
 assert not (result->>'ok')::boolean;
 assert result->'state'->'home'->>'score'='2';
 assert public.save_game_checked('stats-test-game','wrong',base,'{}')->'state' is null;
end $$;
rollback;
