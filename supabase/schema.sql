-- Snapshot of the database schema (Supabase Postgres, project "cto-tasks"), taken 13/10/2026.
-- Reference only: the live database was built with Supabase migrations
-- (init_schema, mvp_features, team_code_setup_flow, revoke_trigger_fn_exec, comment_mentions).
-- Changes since this snapshot are in supabase/migrations/, applied in order on top of it
-- (new_model: decisions, Claude tasks, commitments, ideas, meetings; redact_item; project_stage).
-- No secrets here: the team code is chosen in the app on first launch and stored only as a SHA-256 hash.

create extension if not exists pgcrypto with schema extensions;

-- ---------- access: one shared team code ----------
create schema if not exists private;
create table private.settings (key text primary key, value text not null);
insert into private.settings (key, value) values ('team_code_hash', ''); -- '' = not set yet

create or replace function private.code_hash(code text) returns text
language sql immutable set search_path to '' as $$
  select encode(extensions.digest(coalesce(code, ''), 'sha256'), 'hex')
$$;

-- RLS check: the app sends the code in the x-team-code header on every request.
create or replace function public.has_team_code() returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce(
    (select value from private.settings where key = 'team_code_hash') <> ''
    and private.code_hash(current_setting('request.headers', true)::json ->> 'x-team-code')
        = (select value from private.settings where key = 'team_code_hash'), false)
$$;

create or replace function public.check_team_code(code text) returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce(
    (select value from private.settings where key = 'team_code_hash') <> ''
    and private.code_hash(code) = (select value from private.settings where key = 'team_code_hash'), false)
$$;

create or replace function public.team_code_is_set() returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select value from private.settings where key = 'team_code_hash') <> '', false)
$$;

-- Works only once, while no code is set.
create or replace function public.setup_team_code(code text) returns boolean
language plpgsql security definer set search_path to '' as $$
begin
  if length(coalesce(code, '')) < 6 then raise exception 'code too short'; end if;
  update private.settings set value = private.code_hash(code) where key = 'team_code_hash' and value = '';
  return found;
end $$;

create or replace function public.change_team_code(old_code text, new_code text) returns boolean
language plpgsql security definer set search_path to '' as $$
begin
  if length(coalesce(new_code, '')) < 6 then raise exception 'code too short'; end if;
  update private.settings set value = private.code_hash(new_code)
    where key = 'team_code_hash' and value <> '' and value = private.code_hash(old_code);
  return found;
end $$;

-- ---------- tables ----------
create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  is_team boolean not null default true,
  sort smallint not null default 100,
  created_at timestamptz not null default now(),
  archived boolean not null default false
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text,
  color text,
  grp text,
  phase smallint not null default 0 check (phase between 0 and 4),
  health text not null default 'on_track' check (health in ('on_track', 'at_risk', 'off_track')),
  health_note text,
  owner_id uuid references public.people(id) on delete set null,
  status_today text,
  goals text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  start_date date,
  target_date date,
  description text
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  owner_id uuid references public.people(id) on delete set null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'waiting', 'done')),
  due date,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  phase smallint check (phase between 0 and 4),
  blocked_by_person uuid references public.people(id) on delete set null,
  blocked_reason text,
  focus boolean not null default false,
  notes text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz,
  archived boolean not null default false,
  private boolean not null default false,
  sort double precision
);

create table public.checklist (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  sort double precision not null default extract(epoch from now()),
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid references public.people(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.activity (
  id bigint generated always as identity primary key,
  task_id uuid references public.tasks(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  actor_id uuid references public.people(id) on delete set null,
  kind text not null, -- created | status | assigned | due | comment
  payload jsonb,
  at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  actor_id uuid references public.people(id) on delete set null,
  kind text not null, -- assigned | blocked_by_you | unblocked | comment | mention
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index activity_at_idx on public.activity (at desc);
create index activity_task_id_idx on public.activity (task_id);
create index activity_project_id_idx on public.activity (project_id);
create index activity_actor_id_idx on public.activity (actor_id);
create index checklist_task_id_idx on public.checklist (task_id);
create index comments_task_id_idx on public.comments (task_id);
create index comments_author_id_idx on public.comments (author_id);
create index notifications_task_id_idx on public.notifications (task_id);
create index notifications_actor_id_idx on public.notifications (actor_id);
create index notifications_person_id_read_at_idx on public.notifications (person_id, read_at);
create index projects_owner_id_idx on public.projects (owner_id);
create index tasks_due_idx on public.tasks (due) where status <> 'done';
create index tasks_created_by_idx on public.tasks (created_by);
create index tasks_blocked_by_person_idx on public.tasks (blocked_by_person);
create index tasks_project_id_idx on public.tasks (project_id);
create index tasks_owner_id_status_idx on public.tasks (owner_id, status);

-- ---------- row level security: everything requires the team code ----------
alter table public.people enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.checklist enable row level security;
alter table public.comments enable row level security;
alter table public.activity enable row level security;
alter table public.notifications enable row level security;

create policy team_all on public.people for all to anon, authenticated using ((select public.has_team_code())) with check ((select public.has_team_code()));
create policy team_all on public.projects for all to anon, authenticated using ((select public.has_team_code())) with check ((select public.has_team_code()));
create policy team_all on public.tasks for all to anon, authenticated using ((select public.has_team_code())) with check ((select public.has_team_code()));
create policy team_all on public.checklist for all to anon, authenticated using ((select public.has_team_code())) with check ((select public.has_team_code()));
create policy team_all on public.comments for all to anon, authenticated using ((select public.has_team_code())) with check ((select public.has_team_code()));
create policy team_all on public.notifications for all to anon, authenticated using ((select public.has_team_code())) with check ((select public.has_team_code()));
create policy team_read on public.activity for select to anon, authenticated using ((select public.has_team_code())); -- written only by triggers

-- ---------- triggers: timestamps, activity log, notifications ----------
create or replace function public.touch() returns trigger
language plpgsql set search_path to '' as $$
begin
  new.updated_at = now();
  if tg_table_name = 'tasks' then
    if new.status = 'done' and old.status is distinct from 'done' then new.done_at = now(); end if;
    if new.status <> 'done' then new.done_at = null; end if;
  end if;
  return new;
end $$;

-- The acting person comes from the x-actor header the app sends.
create or replace function public.log_task() returns trigger
language plpgsql security definer set search_path to '' as $$
declare actor uuid;
begin
  begin actor := nullif(current_setting('request.headers', true)::json ->> 'x-actor','')::uuid; exception when others then actor := null; end;
  if tg_op = 'INSERT' then
    insert into public.activity(task_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'created', jsonb_build_object('title', new.title));
    if new.owner_id is not null and new.owner_id is distinct from actor then
      insert into public.notifications(person_id, task_id, actor_id, kind, body) values (new.owner_id, new.id, actor, 'assigned', new.title);
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.activity(task_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'status', jsonb_build_object('from', old.status, 'to', new.status, 'title', new.title, 'reason', new.blocked_reason));
    if old.status = 'blocked' and new.status <> 'blocked' and new.owner_id is not null and new.owner_id is distinct from actor then
      insert into public.notifications(person_id, task_id, actor_id, kind, body) values (new.owner_id, new.id, actor, 'unblocked', new.title);
    end if;
  end if;
  if new.owner_id is distinct from old.owner_id and new.owner_id is not null then
    insert into public.activity(task_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'assigned', jsonb_build_object('to', new.owner_id, 'title', new.title));
    if new.owner_id is distinct from actor then
      insert into public.notifications(person_id, task_id, actor_id, kind, body) values (new.owner_id, new.id, actor, 'assigned', new.title);
    end if;
  end if;
  if new.blocked_by_person is distinct from old.blocked_by_person and new.blocked_by_person is not null
     and new.status in ('blocked','waiting') and new.blocked_by_person is distinct from actor then
    insert into public.notifications(person_id, task_id, actor_id, kind, body)
      values (new.blocked_by_person, new.id, actor, 'blocked_by_you', coalesce(new.blocked_reason, new.title));
  end if;
  if new.due is distinct from old.due then
    insert into public.activity(task_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'due', jsonb_build_object('from', old.due, 'to', new.due, 'title', new.title));
  end if;
  return new;
end $$;

-- Comments notify the task owner, and anyone tagged with @name.
create or replace function public.log_comment() returns trigger
language plpgsql security definer set search_path to '' as $$
declare t record;
begin
  select id, title, owner_id, project_id into t from public.tasks where id = new.task_id;
  insert into public.activity(task_id, project_id, actor_id, kind, payload)
    values (t.id, t.project_id, new.author_id, 'comment', jsonb_build_object('title', t.title, 'body', left(new.body, 200)));
  if t.owner_id is not null and t.owner_id is distinct from new.author_id then
    insert into public.notifications(person_id, task_id, actor_id, kind, body) values (t.owner_id, t.id, new.author_id, 'comment', left(new.body, 200));
  end if;
  insert into public.notifications(person_id, task_id, actor_id, kind, body)
    select p.id, t.id, new.author_id, 'mention', left(new.body, 200)
    from public.people p
    where not p.archived and p.id is distinct from new.author_id and p.id is distinct from t.owner_id
      and length(p.name) > 0 and position('@' || p.name in new.body) > 0;
  return new;
end $$;

create trigger tasks_touch before update on public.tasks for each row execute function public.touch();
create trigger projects_touch before update on public.projects for each row execute function public.touch();
create trigger tasks_log after insert or update on public.tasks for each row execute function public.log_task();
create trigger comments_log after insert on public.comments for each row execute function public.log_comment();

revoke execute on function public.touch() from public, anon, authenticated;
revoke execute on function public.log_task() from public, anon, authenticated;
revoke execute on function public.log_comment() from public, anon, authenticated;
