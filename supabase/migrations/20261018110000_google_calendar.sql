-- Google Calendar, per person. Each person signs in with Google once from the platform (OAuth, scope calendar.events);
-- the Edge Function `gcal` keeps their refresh token here and reads and writes their calendar on their behalf.
-- Only the browser that finished the Google sign-in can read the titles or create events: it holds a device token,
-- of which only the hash is kept. Everyone on the team sees the others only as busy times.
-- Tokens live in the private schema and are reached only by the function (service_role), never by the browser.

create table if not exists private.gcal_links (
  person_id uuid primary key references public.people(id) on delete cascade,
  email text not null,
  refresh_token text not null,
  device_hashes text[] not null default '{}',
  connected_at timestamptz not null default now()
);

create table if not exists private.gcal_states (
  state text primary key,
  person_id uuid not null references public.people(id) on delete cascade,
  return_to text not null,
  created_at timestamptz not null default now()
);

-- The browser asks for a one-time sign-in state, as the person it acts for, then goes to /gcal/start?state=...
create or replace function public.gcal_state_create(p_return text default '/next/') returns text
language plpgsql security definer set search_path to '' as $$
declare
  me uuid := private.actor();
  s text;
begin
  if not public.has_team_code() then raise exception 'not allowed'; end if;
  if me is null or private.is_agent(me) or not exists (select 1 from public.people where id = me and is_team and not archived) then
    raise exception 'רק אדם מהצוות מחבר יומן, לעצמו.';
  end if;
  if p_return !~ '^/[A-Za-z0-9/_.-]*$' then p_return := '/next/'; end if;
  delete from private.gcal_states where created_at < now() - interval '15 minutes';
  s := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.gcal_states(state, person_id, return_to) values (s, me, p_return);
  return s;
end $$;

-- Who is connected, for the team's view (no tokens, no emails).
create or replace function public.gcal_linked()
returns table (person_id uuid, connected_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select l.person_id, l.connected_at from private.gcal_links l where public.has_team_code()
$$;

-- The function's side (service_role only).
create or replace function public.gcal_state_peek(p_state text) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from private.gcal_states where state = p_state and created_at > now() - interval '10 minutes')
$$;

create or replace function public.gcal_state_take(p_state text)
returns table (person_id uuid, return_to text)
language sql security definer set search_path to '' as $$
  delete from private.gcal_states where state = p_state and created_at > now() - interval '10 minutes'
  returning person_id, return_to
$$;

-- Saves the link and adds this device. Google sends a refresh token on every consent (prompt=consent); keep the old one
-- if it ever does not. The last 10 devices are kept.
create or replace function public.gcal_link_save(p_person uuid, p_email text, p_refresh text, p_device text) returns void
language sql security definer set search_path to '' as $$
  insert into private.gcal_links(person_id, email, refresh_token, device_hashes)
  values (p_person, p_email, p_refresh, array[private.code_hash(p_device)])
  on conflict (person_id) do update set
    email = excluded.email,
    refresh_token = coalesce(nullif(excluded.refresh_token, ''), private.gcal_links.refresh_token),
    device_hashes = (array[private.code_hash(p_device)] || private.gcal_links.device_hashes)[1:10],
    connected_at = now()
$$;

create or replace function public.gcal_link_get(p_person uuid, p_device text)
returns table (email text, refresh_token text, device_ok boolean)
language sql stable security definer set search_path to '' as $$
  select l.email, l.refresh_token, coalesce(private.code_hash(p_device) = any(l.device_hashes), false)
  from private.gcal_links l where l.person_id = p_person
$$;

create or replace function public.gcal_links_team()
returns table (person_id uuid, email text, refresh_token text)
language sql stable security definer set search_path to '' as $$
  select l.person_id, l.email, l.refresh_token from private.gcal_links l
  join public.people p on p.id = l.person_id where p.is_team and not p.archived
$$;

create or replace function public.gcal_link_delete(p_person uuid) returns text
language sql security definer set search_path to '' as $$
  delete from private.gcal_links where person_id = p_person returning refresh_token
$$;

revoke execute on function public.gcal_state_create(text) from public;
revoke execute on function public.gcal_linked() from public;
grant execute on function public.gcal_state_create(text) to anon, authenticated;
grant execute on function public.gcal_linked() to anon, authenticated;
revoke execute on function public.gcal_state_peek(text) from public, anon, authenticated;
revoke execute on function public.gcal_state_take(text) from public, anon, authenticated;
revoke execute on function public.gcal_link_save(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.gcal_link_get(uuid, text) from public, anon, authenticated;
revoke execute on function public.gcal_links_team() from public, anon, authenticated;
revoke execute on function public.gcal_link_delete(uuid) from public, anon, authenticated;
grant execute on function public.gcal_state_peek(text), public.gcal_state_take(text), public.gcal_link_save(uuid, text, text, text),
  public.gcal_link_get(uuid, text), public.gcal_links_team(), public.gcal_link_delete(uuid) to service_role;
