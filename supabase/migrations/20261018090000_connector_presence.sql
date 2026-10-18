-- Who on the team has Claude connected, and when their Claude last reached the platform.
-- Reads only the person, whether they have an active key and the last time a key was used; never the keys themselves.
create or replace function public.connector_presence()
returns table (person_id uuid, has_key boolean, last_used_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select p.id,
    exists (select 1 from private.connector_keys k where k.person_id = p.id and k.revoked_at is null),
    (select max(k.last_used_at) from private.connector_keys k where k.person_id = p.id and k.revoked_at is null)
  from public.people p
  where public.has_team_code() and not p.archived and not p.is_agent
$$;
revoke execute on function public.connector_presence() from public;
grant execute on function public.connector_presence() to anon, authenticated;

-- The key's last use was written at most every 5 minutes; every 2 minutes keeps "online" closer to the truth.
create or replace function public.connector_whoami(p_key text)
returns table (person_id uuid, person_name text, team_id uuid, agent_id uuid, enabled boolean)
language plpgsql security definer set search_path to '' as $$
declare
  kid uuid;
  pid uuid;
begin
  select k.id, k.person_id into kid, pid from private.connector_keys k
    where k.key_hash = private.code_hash(p_key) and k.revoked_at is null;
  if kid is null then return; end if;
  update private.connector_keys set last_used_at = now() where id = kid and (last_used_at is null or last_used_at < now() - interval '2 minutes');
  return query
    select p.id, p.name, p.team_id,
      (select a.id from public.people a where a.is_agent and a.team_id = p.team_id and not a.archived order by a.created_at limit 1),
      coalesce((select s.connector_enabled from public.team_settings s where s.team_id = p.team_id), false)
    from public.people p where p.id = pid and not p.archived;
end $$;
revoke execute on function public.connector_whoami(text) from public, anon, authenticated;
grant execute on function public.connector_whoami(text) to service_role;
