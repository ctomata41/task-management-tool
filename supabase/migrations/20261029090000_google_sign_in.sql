-- Signing in with Google, for the whole site (/m/, /next/ and the old app). One Google screen both identifies the person
-- and connects their Google Calendar. Someone new waits until the commander approves them and sets what they may do:
-- commander, member or external, and for a member the deputy's command view (people.is_command).
--
-- How it works: the Edge Function `gcal` runs the Google sign-in with the team's existing OAuth client and the existing
-- redirect address (/gcal/callback), keeps the Google identity in private.accounts, and hands the browser a session
-- token (x-session header). Only its hash is kept. Every rule in the database goes through has_team_code() and
-- private.actor(), so both learn the session here: a signed-in person is who the session says, whatever x-actor claims.
-- That closes the week-1 gap for everyone who signs in with Google. The team code keeps working beside it until the
-- commander closes it from the permissions page (private.settings 'team_code_closed').
--
-- Additive: the app, the connector and the functions keep working on the team code until then.
-- After applying, make the first commander once, in the SQL Editor (the email of their Google account):
--   select private.auth_bootstrap('their.address@gmail.com', 'יואש');

-- ---------- people: what each one may do ----------
alter table public.people
  add column if not exists access text not null default 'member' check (access in ('commander', 'member', 'external')),
  add column if not exists email text;

-- ---------- Google identities and sessions (private: reached only through the functions below) ----------
create table if not exists private.accounts (
  id uuid primary key default gen_random_uuid(),
  google_sub text unique,                    -- empty for an address the commander or the bootstrap approved before sign-in
  email text not null,
  name text not null default '',
  picture text,
  person_id uuid unique references public.people(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'active', 'blocked')),
  pending_refresh text,                      -- the calendar's Google token, kept until the commander approves
  requested_at timestamptz not null default now(),
  decided_by uuid references public.people(id) on delete set null,
  decided_at timestamptz,
  last_seen timestamptz
);
create unique index if not exists accounts_email_idx on private.accounts (lower(email));

create table if not exists private.sessions (
  token_hash text primary key,
  account_id uuid not null references private.accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days',
  revoked_at timestamptz
);
create index if not exists sessions_account_idx on private.sessions (account_id);

-- ---------- who is asking ----------
create or replace function private.header(h text) returns text
language plpgsql stable set search_path to '' as $$
begin
  return nullif(current_setting('request.headers', true)::json ->> h, '');
exception when others then
  return null;
end $$;

-- The Edge Functions call the database with the service key and say who acts in x-actor (the connector's agents).
create or replace function private.is_service() returns boolean
language plpgsql stable set search_path to '' as $$
begin
  return coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role';
exception when others then
  return false;
end $$;

create or replace function private.session_account() returns uuid
language sql stable security definer set search_path to '' as $$
  select s.account_id from private.sessions s
  where private.header('x-session') is not null
    and s.token_hash = private.code_hash(private.header('x-session'))
    and s.revoked_at is null and s.expires_at > now()
$$;

-- The person behind this request's session, only once the commander approved them.
create or replace function private.session_person() returns uuid
language sql stable security definer set search_path to '' as $$
  select a.person_id from private.accounts a join public.people p on p.id = a.person_id
  where a.id = private.session_account() and a.status = 'active' and not p.archived
$$;

create or replace function private.code_closed() returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select value from private.settings where key = 'team_code_closed') = 'true', false)
$$;

create or replace function private.is_commander() returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select access = 'commander' from public.people where id = private.session_person()), false)
$$;

-- Every row rule asks this. A signed-in, approved person; or, until the commander closes it, the team code.
create or replace function public.has_team_code() returns boolean
language sql stable security definer set search_path to '' as $$
  select private.session_person() is not null
    or (not private.code_closed() and coalesce(
      (select value from private.settings where key = 'team_code_hash') <> ''
      and private.code_hash(current_setting('request.headers', true)::json ->> 'x-team-code')
          = (select value from private.settings where key = 'team_code_hash'), false))
$$;

create or replace function public.check_team_code(code text) returns boolean
language sql stable security definer set search_path to '' as $$
  select not private.code_closed() and coalesce(
    (select value from private.settings where key = 'team_code_hash') <> ''
    and private.code_hash(code) = (select value from private.settings where key = 'team_code_hash'), false)
$$;

-- Who acts: the session's person when there is one (x-actor is ignored then), else x-actor as before. Security definer,
-- because row rules call it as anon, which can't reach the private schema by name.
create or replace function private.actor() returns uuid
language plpgsql stable security definer set search_path to '' as $$
declare
  p uuid := private.session_person();
begin
  if p is not null then return p; end if;
  if private.code_closed() and not private.is_service() then return null; end if;
  return nullif(private.header('x-actor'), '')::uuid;
exception when others then
  return null;
end $$;

-- ---------- only the commander changes what someone may do ----------
-- A request from the browser (anon) can't change access, the command flag or the email, and a person it adds is a
-- member. The commander's own requests, the functions and the SQL Editor pass.
create or replace function private.guard_people_access() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  role text;
begin
  begin
    role := coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '');
  exception when others then role := '';
  end;
  if role not in ('anon', 'authenticated') or private.is_commander() then return new; end if;
  if tg_op = 'INSERT' then
    new.access := 'member';
    new.is_command := false;
    new.email := null;
  elsif new.access is distinct from old.access or new.is_command is distinct from old.is_command or new.email is distinct from old.email then
    raise exception 'רק המפקד משנה הרשאות, בדף ההרשאות.';
  end if;
  return new;
end $$;
drop trigger if exists people_guard_access on public.people;
create trigger people_guard_access before insert or update on public.people for each row execute function private.guard_people_access();

-- ---------- the browser's side ----------
create or replace function public.auth_code_open() returns boolean
language sql stable security definer set search_path to '' as $$
  select not private.code_closed()
$$;

-- This browser's session: who it is and where they stand. Pending and blocked people see only this.
create or replace function public.auth_me()
returns table (account_id uuid, email text, name text, picture text, status text, person_id uuid, person_name text,
  access text, is_command boolean, code_open boolean, waiting int)
language sql stable security definer set search_path to '' as $$
  select a.id, a.email, a.name, a.picture,
    case when a.status = 'active' and (p.id is null or p.archived) then 'pending' else a.status end,
    p.id, p.name, p.access, p.is_command, not private.code_closed(),
    case when a.status = 'active' and p.access = 'commander' then (select count(*)::int from private.accounts where status = 'pending') else 0 end
  from private.accounts a left join public.people p on p.id = a.person_id
  where a.id = private.session_account()
$$;

create or replace function public.auth_signout() returns boolean
language sql security definer set search_path to '' as $$
  update private.sessions set revoked_at = now()
  where token_hash = private.code_hash(private.header('x-session')) and revoked_at is null
  returning true
$$;

-- ---------- the commander's permissions page ----------
create or replace function private.need_commander() returns void
language plpgsql stable security definer set search_path to '' as $$
begin
  if not private.is_commander() then raise exception 'רק המפקד מאשר אנשים ונותן הרשאות.'; end if;
end $$;

create or replace function public.auth_accounts()
returns table (id uuid, email text, name text, picture text, status text, person_id uuid, requested_at timestamptz,
  decided_at timestamptz, last_seen timestamptz, signed_in boolean)
language plpgsql stable security definer set search_path to '' as $$
begin
  perform private.need_commander();
  return query select a.id, a.email, a.name, a.picture, a.status, a.person_id, a.requested_at, a.decided_at, a.last_seen,
    a.google_sub is not null
  from private.accounts a order by a.requested_at desc;
end $$;

-- Sets what a person may do. A commander always has the command view; an external person is outside the team.
create or replace function private.set_access(p_person uuid, p_access text, p_command boolean) returns void
language plpgsql security definer set search_path to '' as $$
begin
  if p_access not in ('commander', 'member', 'external') then raise exception 'תפקיד לא מוכר.'; end if;
  if p_access <> 'commander' and exists (select 1 from public.people where id = p_person and access = 'commander')
     and (select count(*) from public.people where access = 'commander' and not archived) <= 1 then
    raise exception 'צריך להישאר לפחות מפקד אחד.';
  end if;
  update public.people set access = p_access, is_command = (p_access = 'commander' or (p_access = 'member' and coalesce(p_command, false))),
    is_team = (p_access <> 'external')
  where id = p_person and not is_agent;
end $$;

-- Approves someone who signed in (or lets a blocked one back): links them to a person on the team, or adds a new one.
create or replace function public.auth_approve(p_account uuid, p_person uuid default null, p_name text default null,
  p_access text default 'member', p_command boolean default false) returns uuid
language plpgsql security definer set search_path to '' as $$
declare
  a private.accounts;
  pid uuid := p_person;
begin
  perform private.need_commander();
  select * into a from private.accounts where id = p_account for update;
  if a.id is null then raise exception 'הבקשה לא נמצאה.'; end if;
  if pid is null then pid := a.person_id; end if;
  if pid is not null then
    if not exists (select 1 from public.people where id = pid and not archived and not is_agent) then raise exception 'האדם לא נמצא בצוות.'; end if;
    if exists (select 1 from private.accounts where person_id = pid and id <> a.id) then raise exception 'לאדם הזה כבר יש חשבון Google אחר.'; end if;
  else
    insert into public.people (name, role, is_team, sort)
    values (coalesce(nullif(trim(p_name), ''), nullif(a.name, ''), split_part(a.email, '@', 1)), null, p_access <> 'external',
      coalesce((select max(sort) + 1 from public.people where not is_agent and sort < 50), 10))
    returning id into pid;
  end if;
  perform private.set_access(pid, p_access, p_command);
  update public.people set email = a.email where id = pid;
  update private.accounts set status = 'active', person_id = pid, decided_by = private.session_person(), decided_at = now(),
    pending_refresh = null where id = a.id;
  -- The calendar they allowed when they signed in starts working now.
  if a.pending_refresh is not null then
    insert into private.gcal_links (person_id, email, refresh_token) values (pid, a.email, a.pending_refresh)
    on conflict (person_id) do update set email = excluded.email, refresh_token = excluded.refresh_token, connected_at = now();
  end if;
  return pid;
end $$;

-- Says no, or takes access away. The person's work stays; only the sign-in stops.
create or replace function public.auth_block(p_account uuid) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform private.need_commander();
  if (select person_id from private.accounts where id = p_account) = private.session_person() then raise exception 'אי אפשר לחסום את עצמך.'; end if;
  update private.accounts set status = 'blocked', decided_by = private.session_person(), decided_at = now(), pending_refresh = null where id = p_account;
  update private.sessions set revoked_at = now() where account_id = p_account and revoked_at is null;
end $$;

create or replace function public.auth_set_access(p_person uuid, p_access text, p_command boolean default false) returns void
language plpgsql security definer set search_path to '' as $$
begin
  perform private.need_commander();
  perform private.set_access(p_person, p_access, p_command);
end $$;

-- Approves an address before its owner signs in, linked to a person on the team.
create or replace function public.auth_invite(p_email text, p_person uuid, p_access text default 'member', p_command boolean default false) returns uuid
language plpgsql security definer set search_path to '' as $$
declare
  e text := lower(trim(p_email));
  aid uuid;
begin
  perform private.need_commander();
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'כתובת מייל לא תקינה.'; end if;
  if exists (select 1 from private.accounts where lower(email) = e) then raise exception 'הכתובת הזו כבר ברשימה.'; end if;
  insert into private.accounts (email, status) values (e, 'pending') returning id into aid;
  perform public.auth_approve(aid, p_person, null, p_access, p_command);
  return aid;
end $$;

create or replace function public.auth_set_code(p_open boolean) returns boolean
language plpgsql security definer set search_path to '' as $$
begin
  perform private.need_commander();
  insert into private.settings (key, value) values ('team_code_closed', case when p_open then 'false' else 'true' end)
  on conflict (key) do update set value = excluded.value;
  return p_open;
end $$;

-- ---------- the function's side (service_role only) ----------
-- Google sign-in is the first and only step of the trip that changes `kind`; it carries no person yet.
alter table private.gcal_states alter column person_id drop not null;
alter table private.gcal_states add column if not exists kind text not null default 'link';

create or replace function public.auth_state_create(p_return text) returns text
language plpgsql security definer set search_path to '' as $$
declare
  s text;
begin
  if p_return is null or p_return !~ '^/[A-Za-z0-9/_.?=&-]*$' then p_return := '/'; end if;
  delete from private.gcal_states where created_at < now() - interval '15 minutes';
  s := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.gcal_states (state, person_id, return_to, kind) values (s, null, p_return, 'signin');
  return s;
end $$;

drop function if exists public.gcal_state_take(text);
create function public.gcal_state_take(p_state text)
returns table (person_id uuid, return_to text, kind text)
language sql security definer set search_path to '' as $$
  delete from private.gcal_states where state = p_state and created_at > now() - interval '10 minutes'
  returning person_id, return_to, kind
$$;

-- Finds the account of this Google identity: by its id, or the first time by an approved address; else a new request.
create or replace function public.auth_google_signin(p_sub text, p_email text, p_name text, p_picture text)
returns table (account_id uuid, status text, person_id uuid)
language plpgsql security definer set search_path to '' as $$
declare
  aid uuid;
begin
  select id into aid from private.accounts where google_sub = p_sub;
  if aid is null then
    select id into aid from private.accounts where lower(email) = lower(p_email) and google_sub is null;
    if aid is null and exists (select 1 from private.accounts where lower(email) = lower(p_email)) then
      raise exception 'email belongs to another Google account';
    end if;
    if aid is null then
      insert into private.accounts (google_sub, email, name, picture) values (p_sub, p_email, coalesce(p_name, ''), p_picture) returning id into aid;
    end if;
  end if;
  update private.accounts set google_sub = p_sub, email = p_email, name = coalesce(nullif(p_name, ''), name), picture = p_picture, last_seen = now()
  where id = aid;
  return query select a.id, a.status, a.person_id from private.accounts a where a.id = aid;
end $$;

create or replace function public.auth_session_create(p_account uuid, p_token text) returns void
language sql security definer set search_path to '' as $$
  delete from private.sessions where expires_at < now() - interval '7 days';
  insert into private.sessions (token_hash, account_id) values (private.code_hash(p_token), p_account);
$$;

create or replace function public.auth_pending_refresh(p_account uuid, p_refresh text) returns void
language sql security definer set search_path to '' as $$
  update private.accounts set pending_refresh = p_refresh where id = p_account and status <> 'active'
$$;

-- For the functions (gcal, voice, the platform's Claude): the person a request acts for, from its session, or from the
-- team code and x-actor while the code is open. Null = not signed in.
create or replace function public.auth_who(p_session text, p_code text, p_actor text) returns uuid
language plpgsql stable security definer set search_path to '' as $$
declare
  pid uuid;
begin
  if coalesce(p_session, '') <> '' then
    select a.person_id into pid from private.sessions s join private.accounts a on a.id = s.account_id
      join public.people p on p.id = a.person_id
    where s.token_hash = private.code_hash(p_session) and s.revoked_at is null and s.expires_at > now()
      and a.status = 'active' and not p.archived;
    return pid;
  end if;
  if coalesce(p_code, '') = '' or not public.check_team_code(p_code) then return null; end if;
  begin
    return p_actor::uuid;
  exception when others then
    return null;
  end;
end $$;

-- ---------- the first commander, once, from the SQL Editor ----------
create or replace function private.auth_bootstrap(p_email text, p_person_name text) returns uuid
language plpgsql security definer set search_path to '' as $$
declare
  pid uuid;
  aid uuid;
begin
  select id into pid from public.people where name = p_person_name and not archived and not is_agent order by sort limit 1;
  if pid is null then raise exception 'no person named %', p_person_name; end if;
  insert into private.accounts (email, status, person_id, decided_at) values (lower(trim(p_email)), 'active', pid, now())
  on conflict ((lower(email))) do update set status = 'active', person_id = pid, decided_at = now()
  returning id into aid;
  update public.people set access = 'commander', is_command = true, email = lower(trim(p_email)) where id = pid;
  return aid;
end $$;

-- ---------- who may call what ----------
revoke execute on function public.auth_code_open(), public.auth_me(), public.auth_signout(), public.auth_accounts(),
  public.auth_approve(uuid, uuid, text, text, boolean), public.auth_block(uuid), public.auth_set_access(uuid, text, boolean),
  public.auth_invite(text, uuid, text, boolean), public.auth_set_code(boolean) from public;
grant execute on function public.auth_code_open(), public.auth_me(), public.auth_signout(), public.auth_accounts(),
  public.auth_approve(uuid, uuid, text, text, boolean), public.auth_block(uuid), public.auth_set_access(uuid, text, boolean),
  public.auth_invite(text, uuid, text, boolean), public.auth_set_code(boolean) to anon, authenticated;
revoke execute on function public.auth_state_create(text), public.gcal_state_take(text), public.auth_google_signin(text, text, text, text),
  public.auth_session_create(uuid, text), public.auth_pending_refresh(uuid, text), public.auth_who(text, text, text)
  from public, anon, authenticated;
grant execute on function public.auth_state_create(text), public.gcal_state_take(text), public.auth_google_signin(text, text, text, text),
  public.auth_session_create(uuid, text), public.auth_pending_refresh(uuid, text), public.auth_who(text, text, text) to service_role;
revoke execute on function private.auth_bootstrap(text, text), private.set_access(uuid, text, boolean) from public, anon, authenticated;
