-- Phone notifications (spec, chapter 9), sent as Web Push by the Edge Function in supabase/functions/push.
-- Right away only for a blocker, an assignment or a mention that a person made; everything else waits for one digest a
-- day; nothing in the team's quiet hours. The digest and the commitment reminders are fixed rules without AI: written in
-- Hebrew, approved in the app before they run, and every run is logged.
-- Additive only, like the earlier migrations, so the live app keeps working.
--
-- After applying, store the project URL once (it is public; kept out of this file so it stays portable):
--   insert into private.settings (key, value) values ('project_url', 'https://<project-ref>.supabase.co');
-- and deploy the function without JWT verification (it checks the shared secret below itself):
--   supabase functions deploy push --no-verify-jwt

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------- phones that asked for notifications ----------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id),
  person_id uuid not null references public.people(id) on delete cascade,
  endpoint text not null unique, -- the push service address of one browser on one device
  p256dh text not null,
  auth text not null,
  device text,                   -- a short label, for example "iPhone"
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  last_status int,
  failures int not null default 0
);
create index push_subscriptions_person_id_idx on public.push_subscriptions (person_id);
create index push_subscriptions_team_id_idx on public.push_subscriptions (team_id);
alter table public.push_subscriptions enable row level security;
-- No policies: the app reaches this table only through the functions below, the push function as the service role.

-- ---------- the keys the push services check (VAPID), made by the push function on its first run ----------
create table private.push_keys (
  id boolean primary key default true check (id), -- one row
  public_key text not null,
  private_jwk jsonb not null,
  created_at timestamptz not null default now()
);

-- A shared secret, made here and never shown, so only the database can ask the push function to send.
insert into private.settings (key, value) values ('push_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create or replace function public.push_keys_get() returns jsonb
language sql stable security definer set search_path to '' as $$
  select jsonb_build_object('publicKey', public_key, 'privateJwk', private_jwk) from private.push_keys
$$;
create or replace function public.push_keys_init(public_key text, private_jwk jsonb) returns jsonb
language plpgsql security definer set search_path to '' as $$
begin
  insert into private.push_keys (public_key, private_jwk) values (push_keys_init.public_key, push_keys_init.private_jwk)
  on conflict (id) do nothing;
  return public.push_keys_get();
end $$;
create or replace function public.push_secret() returns text
language sql stable security definer set search_path to '' as $$
  select value from private.settings where key = 'push_secret'
$$;
revoke execute on function public.push_keys_get() from public, anon, authenticated;
revoke execute on function public.push_keys_init(text, jsonb) from public, anon, authenticated;
revoke execute on function public.push_secret() from public, anon, authenticated;
grant execute on function public.push_keys_get() to service_role;
grant execute on function public.push_keys_init(text, jsonb) to service_role;
grant execute on function public.push_secret() to service_role;

-- ---------- calling the push function from the database ----------
create or replace function private.push_call(body jsonb) returns bigint
language plpgsql security definer set search_path to '' as $$
declare
  base text := (select value from private.settings where key = 'project_url');
  secret text := (select value from private.settings where key = 'push_secret');
begin
  if base is null or secret is null then return null; end if;
  return net.http_post(
    url := base || '/functions/v1/push',
    body := body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
    timeout_milliseconds := 30000
  );
end $$;

-- ---------- the app: turn notifications on or off on this device, and list my devices ----------
create or replace function public.push_subscribe(endpoint text, p256dh text, auth text, device text default null) returns boolean
language plpgsql security definer set search_path to '' as $$
declare
  me uuid := private.actor();
  my_team uuid;
begin
  if not (select public.has_team_code()) then raise exception 'אין הרשאה'; end if;
  select p.team_id into my_team from public.people p where p.id = me and not p.archived and not p.is_agent;
  if my_team is null then raise exception 'צריך לבחור מי משתמש במכשיר'; end if;
  if push_subscribe.endpoint !~ '^https://' or length(push_subscribe.endpoint) > 1000 then raise exception 'כתובת לא תקינה'; end if;
  insert into public.push_subscriptions as s (team_id, person_id, endpoint, p256dh, auth, device)
  values (my_team, me, push_subscribe.endpoint, push_subscribe.p256dh, push_subscribe.auth, left(push_subscribe.device, 40))
  on conflict on constraint push_subscriptions_endpoint_key do update set team_id = excluded.team_id, person_id = excluded.person_id,
    p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device, failures = 0, last_status = null;
  return true;
end $$;

create or replace function public.push_unsubscribe(endpoint text) returns boolean
language plpgsql security definer set search_path to '' as $$
begin
  if not (select public.has_team_code()) then raise exception 'אין הרשאה'; end if;
  delete from public.push_subscriptions s where s.endpoint = push_unsubscribe.endpoint;
  return found;
end $$;

create or replace function public.push_devices() returns table (endpoint text, device text, created_at timestamptz, last_ok_at timestamptz, last_status int)
language sql stable security definer set search_path to '' as $$
  select s.endpoint, s.device, s.created_at, s.last_ok_at, s.last_status from public.push_subscriptions s
  where (select public.has_team_code()) and s.person_id = private.actor()
  order by s.created_at
$$;

-- ---------- notifications: ring the phone for the kinds that may go out right away ----------
alter table public.notifications
  add column pushed_at timestamptz, -- when it went to a phone; empty = waits for the digest
  add column push_note text;        -- why it did not: digest, quiet, commander, not_person, private, failed

create or replace function private.push_notification() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.kind in ('assigned', 'accountable', 'decision', 'commitment', 'mention', 'blocked_by_you', 'blocked')
     and exists (select 1 from public.push_subscriptions s where s.person_id = new.person_id) then
    perform private.push_call(jsonb_build_object('notification', new.id));
  end if;
  return new;
end $$;
create trigger notifications_push after insert on public.notifications for each row execute function private.push_notification();

-- ---------- a reported blocker also goes to the project lead (spec, chapter 9) ----------
create or replace function public.log_task() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  actor uuid := private.actor();
  reviewer uuid;
  lead uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.activity(task_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'created', jsonb_build_object('title', new.title, 'kind', new.kind));
    if new.owner_id is not null and new.owner_id is distinct from actor and not private.is_agent(new.owner_id) then
      insert into public.notifications(person_id, task_id, actor_id, kind, body) values (new.owner_id, new.id, actor, 'assigned', new.title);
    end if;
    if new.kind = 'claude' and new.accountable_id is not null and new.accountable_id is distinct from actor
       and new.accountable_id is distinct from new.owner_id then
      insert into public.notifications(person_id, task_id, actor_id, kind, body) values (new.accountable_id, new.id, actor, 'accountable', new.title);
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.activity(task_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'status', jsonb_build_object('from', old.status, 'to', new.status, 'title', new.title, 'reason', new.blocked_reason, 'kind', new.kind));
    if old.status = 'blocked' and new.status <> 'blocked' and new.owner_id is not null and new.owner_id is distinct from actor
       and not private.is_agent(new.owner_id) then
      insert into public.notifications(person_id, task_id, actor_id, kind, body) values (new.owner_id, new.id, actor, 'unblocked', new.title);
    end if;
    if new.status = 'review' then
      reviewer := coalesce(new.accountable_id, new.created_by);
      if reviewer is not null and reviewer is distinct from actor and not private.is_agent(reviewer) then
        insert into public.notifications(person_id, task_id, actor_id, kind, body) values (reviewer, new.id, actor, 'review', new.title);
      end if;
    end if;
    if new.status = 'blocked' then
      select owner_id into lead from public.projects where id = new.project_id;
      if lead is not null and lead is distinct from actor and lead is distinct from new.owner_id
         and lead is distinct from new.blocked_by_person and not private.is_agent(lead) then
        insert into public.notifications(person_id, task_id, actor_id, kind, body)
          values (lead, new.id, actor, 'blocked', coalesce(new.blocked_reason, new.title));
      end if;
    end if;
  end if;
  if new.owner_id is distinct from old.owner_id and new.owner_id is not null then
    insert into public.activity(task_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'assigned', jsonb_build_object('to', new.owner_id, 'title', new.title));
    if new.owner_id is distinct from actor and not private.is_agent(new.owner_id) then
      insert into public.notifications(person_id, task_id, actor_id, kind, body) values (new.owner_id, new.id, actor, 'assigned', new.title);
    end if;
  end if;
  if new.kind = 'claude' and new.accountable_id is distinct from old.accountable_id and new.accountable_id is not null
     and new.accountable_id is distinct from actor then
    insert into public.notifications(person_id, task_id, actor_id, kind, body) values (new.accountable_id, new.id, actor, 'accountable', new.title);
  end if;
  if new.blocked_by_person is distinct from old.blocked_by_person and new.blocked_by_person is not null
     and new.status in ('blocked', 'waiting') and new.blocked_by_person is distinct from actor then
    insert into public.notifications(person_id, task_id, actor_id, kind, body)
      values (new.blocked_by_person, new.id, actor, 'blocked_by_you', coalesce(new.blocked_reason, new.title));
  end if;
  if new.due is distinct from old.due then
    insert into public.activity(task_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'due', jsonb_build_object('from', old.due, 'to', new.due, 'title', new.title));
  end if;
  return new;
end $$;

-- ---------- quiet hours and the digest time: part of the work agreement, set at the kickoff ----------
alter table public.team_settings
  add column quiet_from time not null default '19:00',
  add column quiet_to time not null default '08:00',
  add column quiet_days smallint[] not null default '{5,6}', -- whole days without notifications, 0 = Sunday: Friday and Saturday
  add column digest_at time not null default '08:00';

-- ---------- fixed rules: the text people approve is the text that runs ----------
create table public.rules (
  team_id uuid not null references public.teams(id),
  key text not null,
  title text not null,
  body text not null,
  status text not null default 'proposed' check (status in ('proposed', 'active', 'paused')),
  approved_by uuid references public.people(id) on delete set null,
  approved_at timestamptz,
  updated_by uuid references public.people(id) on delete set null,
  updated_at timestamptz not null default now(),
  sort int not null default 0,
  primary key (team_id, key)
);
create index rules_approved_by_idx on public.rules (approved_by);
create index rules_updated_by_idx on public.rules (updated_by);
alter table public.rules enable row level security;
create policy team_read on public.rules for select to anon, authenticated using ((select public.has_team_code()));

insert into public.rules (team_id, key, title, body, sort)
select id, 'digest', 'תקציר יומי',
  'בכל יום עבודה, בשעת התקציר של הצוות, מי שהפעיל התראות מקבל לטלפון התראה אחת: עד חמישה דברים שמחכים לו, כל אחד עם הסיבה, ואחריהם מה שקרה מאז התקציר הקודם ולא שלח התראה (תגובות, החלטות שהתקבלו, חסמים ששוחררו). המפקד לא מקבל תקציר יומי.',
  1 from public.teams;
insert into public.rules (team_id, key, title, body, sort)
select id, 'commitment_reminders', 'תזכורות להתחייבויות',
  'חמישה ימי עבודה ויום עבודה אחד לפני המועד של התחייבות פתוחה, הבעלים שלה מקבל תזכורת בהתראות ובתקציר. תזכורת שלא נענתה תוך יום עבודה (ההתחייבות לא עודכנה ולא סומנה "בזמן") מעלה את ההתחייבות לתצוגת הצוות והפיקוד, עם "עלה כי התזכורת לא נענתה".',
  2 from public.teams;

-- Approving or pausing a rule: only a person on the team, never an agent; it goes to the activity log.
create or replace function public.rule_set(rule_key text, to_status text) returns boolean
language plpgsql security definer set search_path to '' as $$
declare
  me uuid := private.actor();
  my_team uuid;
  r public.rules;
begin
  if not (select public.has_team_code()) then raise exception 'אין הרשאה'; end if;
  select team_id into my_team from public.people where id = me and is_team and not archived and not is_agent;
  if my_team is null then raise exception 'רק אדם מהצוות מאשר או משהה כלל'; end if;
  if to_status not in ('active', 'paused') then raise exception 'מצב לא מוכר'; end if;
  update public.rules set status = to_status, updated_by = me, updated_at = now(),
      approved_by = case when to_status = 'active' then me else approved_by end,
      approved_at = case when to_status = 'active' then now() else approved_at end
    where key = rule_key and team_id = my_team
    returning * into r;
  if not found then raise exception 'הכלל לא נמצא'; end if;
  insert into public.activity(actor_id, kind, payload) values (me, 'rule_' || to_status, jsonb_build_object('title', r.title));
  return true;
end $$;

-- Every run of a rule, one a day: what it did, for the run log in the app.
create table public.rule_runs (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id),
  rule text not null,
  run_date date not null,
  ran_at timestamptz not null default now(),
  summary text not null,
  details jsonb,
  unique (team_id, rule, run_date)
);
alter table public.rule_runs enable row level security;
create policy team_read on public.rule_runs for select to anon, authenticated using ((select public.has_team_code()));

-- Commitment reminders that went out: a reminder nobody answered makes the commitment significant.
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id),
  commitment_id uuid not null references public.commitments(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  step text not null check (step in ('5', '1')), -- workdays before the due date
  due date not null,                             -- the due date it was about: a new date brings new reminders
  sent_at timestamptz not null default now(),
  answered_at timestamptz,                       -- someone on the team said it is on track ("בזמן")
  answered_by uuid references public.people(id) on delete set null,
  unique (commitment_id, step, due)
);
create index reminders_team_id_idx on public.reminders (team_id);
create index reminders_person_id_idx on public.reminders (person_id);
create index reminders_answered_by_idx on public.reminders (answered_by);
alter table public.reminders enable row level security;
create policy team_read on public.reminders for select to anon, authenticated using ((select public.has_team_code()));

-- Answering a reminder: "בזמן", from the owner or anyone on the team who takes it (spec, goal 8). Updating the commitment
-- answers it too; the app sees that from updated_at. Goes to the activity log, so the commitment's history shows it.
create or replace function public.reminder_answer(commitment uuid) returns boolean
language plpgsql security definer set search_path to '' as $$
declare
  me uuid := private.actor();
begin
  if not (select public.has_team_code()) then raise exception 'אין הרשאה'; end if;
  if not exists (select 1 from public.people p where p.id = me and p.is_team and not p.archived and not p.is_agent) then
    raise exception 'רק אדם מהצוות עונה על תזכורת';
  end if;
  update public.reminders r set answered_at = now(), answered_by = me
    where r.commitment_id = reminder_answer.commitment and r.answered_at is null;
  if not found then return false; end if;
  insert into public.activity(commitment_id, project_id, actor_id, kind, payload)
    select c.id, c.project_id, me, 'commitment_on_track', jsonb_build_object('title', c.title, 'direction', c.direction, 'counterpart', c.counterpart)
    from public.commitments c where c.id = reminder_answer.commitment;
  return true;
end $$;

revoke execute on function public.log_task() from public, anon, authenticated;
revoke execute on function private.push_call(jsonb) from public, anon, authenticated;
revoke execute on function private.push_notification() from public, anon, authenticated;

-- ---------- every hour: the push function sends the digest and the reminders when it is time ----------
select cron.schedule('push-hourly', '0 * * * *', $$select private.push_call('{"digest": true}'::jsonb)$$);
