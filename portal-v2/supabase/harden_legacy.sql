-- The previous prototype stored its own sessions/password hashes and exposed public
-- SECURITY DEFINER RPCs. Keep its empty tables for recovery, but make the RPCs
-- unavailable to browser roles now that the portal uses Supabase Auth.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proname like 'portal_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.signature);
  end loop;
end $$;
