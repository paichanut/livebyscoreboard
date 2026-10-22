-- Run after supabase.sql. Atomic writes for two operator workspaces. Safe to rerun.
begin;
create or replace function public.stats_sync_ready()
returns boolean language sql stable as $$ select true $$;
create or replace function public.save_game_checked(p_id text, p_key text, p_base jsonb, p_state jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare current_state jsonb;
begin
  if not public.check_key(p_id,p_key) then return jsonb_build_object('error','locked'); end if;
  select state into current_state from public.games where id=p_id for update;
  if not found then return jsonb_build_object('error','missing'); end if;
  if current_state is distinct from p_base then return jsonb_build_object('ok',false,'state',current_state); end if;
  update public.games set state=p_state, updated_at=now() where id=p_id;
  return jsonb_build_object('ok',true,'state',p_state);
end $$;
revoke all on function public.stats_sync_ready(), public.save_game_checked(text,text,jsonb,jsonb) from public;
grant execute on function public.stats_sync_ready(), public.save_game_checked(text,text,jsonb,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;
