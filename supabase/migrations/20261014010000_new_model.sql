-- The new project model from the spec (interview rounds 2 and 3):
-- a project has a lead and partners and three streams: decisions, Claude tasks and human assignments ("מטלות").
-- Also external commitments, the ideas basket, the weekly meeting, the team context file for Claude and the בלמ״ס guard.
-- Additive only: new tables and new columns with defaults, so the app version that is live keeps working.

-- ---------- who is acting: the app sends the person in the x-actor header ----------
create or replace function private.actor() returns uuid
language plpgsql stable set search_path to '' as $$
begin
  return nullif(current_setting('request.headers', true)::json ->> 'x-actor', '')::uuid;
exception when others then
  return null;
end $$;

-- ---------- teams: every row belongs to a team from day one, so a second team can be added later ----------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
insert into public.teams (name) values ('צוות CTO');
alter table public.teams enable row level security;
create policy team_read on public.teams for select to anon, authenticated using ((select public.has_team_code()));

-- The team new rows belong to when the app does not say. Runs as the caller, under row level security.
create or replace function public.default_team() returns uuid
language sql stable set search_path to '' as $$
  select id from public.teams order by created_at limit 1
$$;

alter table public.people add column team_id uuid not null default public.default_team() references public.teams(id);
alter table public.projects add column team_id uuid not null default public.default_team() references public.teams(id);
alter table public.tasks add column team_id uuid not null default public.default_team() references public.teams(id);

-- ---------- people ----------
alter table public.people
  add column is_command boolean not null default false, -- sees the command view and reviews items flagged as suspicious
  add column is_agent boolean not null default false,   -- an AI agent that works on behalf of a person
  add column declared_at timestamptz;                    -- confirmed "בלמ״ס בלבד" on first sign-in
update public.people set is_command = true where is_team and not archived and name in ('יואש', 'יונתן');
update public.people set is_agent = true where name = 'Claude';

create or replace function private.is_agent(p uuid) returns boolean
language sql stable set search_path to '' as $$
  select coalesce((select is_agent from public.people where id = p), false)
$$;

-- ---------- projects: lead (owner_id) and partners, intent (description), brief for Claude, milestones, links ----------
alter table public.projects
  add column partner_ids uuid[] not null default '{}',
  add column brief text,                              -- what Claude needs to know to work on the project
  add column milestones jsonb not null default '[]',  -- [{id, title, due, done}]
  add column links jsonb not null default '[]',       -- [{label, url}]
  add column stakeholders text,                       -- client and stakeholders
  add column risks text,
  add column classified boolean not null default false, -- the details live on the classified network; only an approved unclassified name here
  add column flagged boolean not null default false;    -- marked as possibly classified: hidden until command checks it

-- ---------- decisions: what people decide; Claude prepares them ----------
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null default public.default_team() references public.teams(id),
  project_id uuid references public.projects(id) on delete set null,
  title text not null,                       -- the question
  context text,
  kind text not null default 'direction' check (kind in ('direction', 'approval', 'gate')), -- gate = open or stop a project
  options jsonb not null default '[]',       -- [{key, label, note, recommended}]
  reason text,                               -- why the recommended option
  unblocks text,                             -- what waits on this decision
  due date,
  assignee_id uuid references public.people(id) on delete set null, -- who decides: the lead or a partner
  status text not null default 'open' check (status in ('open', 'decided', 'cancelled')),
  chosen_key text,
  chosen_label text,
  rationale text,                            -- why it was decided this way
  decided_by uuid references public.people(id) on delete set null,
  decided_at timestamptz,
  source text not null default 'app',        -- app | claude | voice | meeting
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived boolean not null default false,
  flagged boolean not null default false
);

-- ---------- tasks: a Claude task (משימה) or a human assignment (מטלה) ----------
alter table public.tasks drop constraint tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('todo', 'in_progress', 'blocked', 'waiting', 'review', 'done'));
alter table public.tasks
  add column kind text not null default 'human' check (kind in ('human', 'claude')),
  -- what a person has to do: general work, or what Claude cannot do on its own
  add column htype text not null default 'general' check (htype in ('general', 'meeting', 'file', 'connect', 'auth', 'payment', 'other')),
  add column accountable_id uuid references public.people(id) on delete set null, -- the person a Claude task is done for
  add column done_def text,                  -- definition of done
  add column evidence text,                  -- links or proof submitted for review
  add column decision_id uuid references public.decisions(id) on delete set null,
  add column flagged boolean not null default false;

-- Tasks owned by an agent become Claude tasks, done for the project lead (or whoever opened them).
-- Quietly: no new timestamps, log lines or notifications for this.
alter table public.tasks disable trigger tasks_touch;
alter table public.tasks disable trigger tasks_log;
update public.tasks t set kind = 'claude',
  accountable_id = coalesce((select pr.owner_id from public.projects pr where pr.id = t.project_id), t.created_by)
  where t.owner_id in (select id from public.people where is_agent);
alter table public.tasks enable trigger tasks_log;
alter table public.tasks enable trigger tasks_touch;

alter table public.comments add column flagged boolean not null default false;

-- ---------- external commitments: what we promised and what we are waiting for ----------
create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null default public.default_team() references public.teams(id),
  project_id uuid references public.projects(id) on delete set null,
  direction text not null default 'we_owe' check (direction in ('we_owe', 'they_owe')),
  title text not null,                       -- what
  counterpart text,                          -- to whom, or from whom: a person or organization outside the team
  contact text,
  owner_id uuid references public.people(id) on delete set null, -- who on the team keeps it
  due date,
  status text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  done_at timestamptz,
  notes text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived boolean not null default false,
  flagged boolean not null default false
);

-- ---------- the ideas basket ----------
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null default public.default_team() references public.teams(id),
  title text not null,
  notes text,
  status text not null default 'new' check (status in ('new', 'chosen', 'project', 'dropped')),
  project_id uuid references public.projects(id) on delete set null, -- the project it became
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived boolean not null default false,
  flagged boolean not null default false
);

-- ---------- the weekly meeting: next week's priorities and notes ----------
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null default public.default_team() references public.teams(id),
  week_start date not null,                  -- Sunday
  priorities text,                           -- one per line
  notes text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, week_start)
);

-- ---------- team settings: the context file for Claude and the sensitive-word list ----------
create table public.team_settings (
  team_id uuid primary key default public.default_team() references public.teams(id),
  context text,                              -- what every Claude should know about the team; kept by the commander
  word_hashes text[] not null default '{}',  -- the sensitive-word list, kept only as SHA-256 fingerprints, checked in the browser
  updated_by uuid references public.people(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.team_settings (team_id) select id from public.teams;

-- ---------- activity and notifications cover decisions and commitments too ----------
alter table public.activity
  add column decision_id uuid references public.decisions(id) on delete cascade,
  add column commitment_id uuid references public.commitments(id) on delete cascade;
alter table public.notifications
  add column decision_id uuid references public.decisions(id) on delete cascade,
  add column commitment_id uuid references public.commitments(id) on delete cascade;

-- ---------- indexes ----------
create index people_team_id_idx on public.people (team_id);
create index projects_team_id_idx on public.projects (team_id);
create index tasks_team_id_idx on public.tasks (team_id);
create index tasks_accountable_id_idx on public.tasks (accountable_id);
create index tasks_decision_id_idx on public.tasks (decision_id);
create index decisions_team_id_idx on public.decisions (team_id);
create index decisions_project_id_idx on public.decisions (project_id);
create index decisions_assignee_id_status_idx on public.decisions (assignee_id, status);
create index decisions_created_by_idx on public.decisions (created_by);
create index decisions_decided_by_idx on public.decisions (decided_by);
create index commitments_team_id_idx on public.commitments (team_id);
create index commitments_project_id_idx on public.commitments (project_id);
create index commitments_owner_id_idx on public.commitments (owner_id);
create index commitments_created_by_idx on public.commitments (created_by);
create index ideas_team_id_idx on public.ideas (team_id);
create index ideas_project_id_idx on public.ideas (project_id);
create index ideas_created_by_idx on public.ideas (created_by);
create index meetings_created_by_idx on public.meetings (created_by);
create index team_settings_updated_by_idx on public.team_settings (updated_by);
create index activity_decision_id_idx on public.activity (decision_id);
create index activity_commitment_id_idx on public.activity (commitment_id);
create index notifications_decision_id_idx on public.notifications (decision_id);
create index notifications_commitment_id_idx on public.notifications (commitment_id);

-- ---------- row level security: everything still requires the team code ----------
alter table public.decisions enable row level security;
alter table public.commitments enable row level security;
alter table public.ideas enable row level security;
alter table public.meetings enable row level security;
alter table public.team_settings enable row level security;
create policy team_all on public.decisions for all to anon, authenticated using ((select public.has_team_code())) with check ((select public.has_team_code()));
create policy team_all on public.commitments for all to anon, authenticated using ((select public.has_team_code())) with check ((select public.has_team_code()));
create policy team_all on public.ideas for all to anon, authenticated using ((select public.has_team_code())) with check ((select public.has_team_code()));
create policy team_all on public.meetings for all to anon, authenticated using ((select public.has_team_code())) with check ((select public.has_team_code()));
create policy team_read on public.team_settings for select to anon, authenticated using ((select public.has_team_code()));
create policy team_update on public.team_settings for update to anon, authenticated using ((select public.has_team_code())) with check ((select public.has_team_code()));

-- ---------- timestamps ----------
create or replace function public.touch() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  new.updated_at = now();
  if tg_table_name in ('tasks', 'commitments') then
    if new.status = 'done' and old.status is distinct from 'done' then new.done_at = now(); end if;
    if new.status <> 'done' then new.done_at = null; end if;
  elsif tg_table_name = 'decisions' then
    if new.status = 'decided' and old.status is distinct from 'decided' then
      new.decided_at = now();
      new.decided_by = coalesce(new.decided_by, private.actor());
    end if;
    if new.status = 'open' then new.decided_at = null; new.decided_by = null; end if;
  end if;
  return new;
end $$;

create trigger decisions_touch before insert or update on public.decisions for each row execute function public.touch();
create trigger commitments_touch before insert or update on public.commitments for each row execute function public.touch();
create trigger ideas_touch before update on public.ideas for each row execute function public.touch();
create trigger meetings_touch before update on public.meetings for each row execute function public.touch();
create trigger team_settings_touch before update on public.team_settings for each row execute function public.touch();

-- ---------- the AI rules, enforced in the database: an agent never deletes, never closes, never decides ----------
create or replace function public.guard_agent() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if not private.is_agent(private.actor()) then return new; end if;
  if tg_op = 'UPDATE' and new.archived and not old.archived then
    raise exception 'סוכן לא מוחק. מחיקה נעשית רק בידי אדם.';
  end if;
  if tg_table_name = 'tasks' and new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    raise exception 'סוכן לא סוגר משימה. מגישים לבדיקה, ואדם מאשר.';
  end if;
  if tg_table_name = 'decisions' and new.status = 'decided' and (tg_op = 'INSERT' or old.status is distinct from 'decided') then
    raise exception 'רק אדם מחליט.';
  end if;
  if tg_table_name = 'commitments' and new.status <> 'open' and (tg_op = 'INSERT' or old.status = 'open') then
    raise exception 'רק אדם סוגר התחייבות.';
  end if;
  return new;
end $$;

create trigger tasks_guard_agent before insert or update on public.tasks for each row execute function public.guard_agent();
create trigger decisions_guard_agent before insert or update on public.decisions for each row execute function public.guard_agent();
create trigger commitments_guard_agent before insert or update on public.commitments for each row execute function public.guard_agent();
create trigger projects_guard_agent before update on public.projects for each row execute function public.guard_agent();
create trigger ideas_guard_agent before update on public.ideas for each row execute function public.guard_agent();

-- ---------- activity log and notifications ----------
-- Tasks: as before, plus Claude tasks: the accountable person hears about new work and about work waiting for review.
create or replace function public.log_task() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  actor uuid := private.actor();
  reviewer uuid;
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

-- Comments notify whoever answers for the task (the accountable person when an agent owns it), and anyone tagged with @name.
create or replace function public.log_comment() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  t record;
  target uuid;
begin
  select id, title, owner_id, accountable_id, project_id into t from public.tasks where id = new.task_id;
  target := case when private.is_agent(t.owner_id) then t.accountable_id else t.owner_id end;
  insert into public.activity(task_id, project_id, actor_id, kind, payload)
    values (t.id, t.project_id, new.author_id, 'comment', jsonb_build_object('title', t.title, 'body', left(new.body, 200)));
  if target is not null and target is distinct from new.author_id then
    insert into public.notifications(person_id, task_id, actor_id, kind, body) values (target, t.id, new.author_id, 'comment', left(new.body, 200));
  end if;
  insert into public.notifications(person_id, task_id, actor_id, kind, body)
    select p.id, t.id, new.author_id, 'mention', left(new.body, 200)
    from public.people p
    where not p.archived and not p.is_agent and p.id is distinct from new.author_id and p.id is distinct from target
      and length(p.name) > 0 and position('@' || p.name in new.body) > 0;
  return new;
end $$;

-- Decisions: the person who decides hears about it; whoever asked, and the project lead, hear the answer.
create or replace function public.log_decision() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  actor uuid := private.actor();
  lead uuid;
begin
  if tg_op = 'INSERT' then
    insert into public.activity(decision_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'decision_new', jsonb_build_object('title', new.title));
    if new.status = 'decided' then -- recorded after the fact, for example in the weekly meeting
      insert into public.activity(decision_id, project_id, actor_id, kind, payload)
        values (new.id, new.project_id, actor, 'decision_decided',
          jsonb_build_object('title', new.title, 'chosen', new.chosen_label, 'rationale', left(new.rationale, 300)));
    end if;
    if new.status = 'open' and new.assignee_id is not null and new.assignee_id is distinct from actor and not private.is_agent(new.assignee_id) then
      insert into public.notifications(person_id, decision_id, actor_id, kind, body) values (new.assignee_id, new.id, actor, 'decision', new.title);
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.activity(decision_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'decision_' || new.status,
        jsonb_build_object('title', new.title, 'chosen', new.chosen_label, 'rationale', left(new.rationale, 300)));
    if new.status = 'decided' then
      select owner_id into lead from public.projects where id = new.project_id;
      insert into public.notifications(person_id, decision_id, actor_id, kind, body)
        select distinct x.p, new.id, actor, 'decided', coalesce(new.chosen_label, new.title)
        from unnest(array[new.created_by, lead]) as x(p)
        where x.p is not null and x.p is distinct from actor and not private.is_agent(x.p);
    end if;
  end if;
  if new.assignee_id is distinct from old.assignee_id and new.assignee_id is not null and new.status = 'open' then
    insert into public.activity(decision_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'decision_assigned', jsonb_build_object('title', new.title, 'to', new.assignee_id));
    if new.assignee_id is distinct from actor and not private.is_agent(new.assignee_id) then
      insert into public.notifications(person_id, decision_id, actor_id, kind, body) values (new.assignee_id, new.id, actor, 'decision', new.title);
    end if;
  end if;
  return new;
end $$;

-- Commitments: the person who keeps one hears about it; the log keeps every change of status, owner and date.
create or replace function public.log_commitment() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  actor uuid := private.actor();
begin
  if tg_op = 'INSERT' then
    insert into public.activity(commitment_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'commitment_new',
        jsonb_build_object('title', new.title, 'direction', new.direction, 'counterpart', new.counterpart, 'due', new.due));
    if new.owner_id is not null and new.owner_id is distinct from actor and not private.is_agent(new.owner_id) then
      insert into public.notifications(person_id, commitment_id, actor_id, kind, body) values (new.owner_id, new.id, actor, 'commitment', new.title);
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.activity(commitment_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'commitment_' || new.status,
        jsonb_build_object('title', new.title, 'direction', new.direction, 'counterpart', new.counterpart));
  end if;
  if new.owner_id is distinct from old.owner_id and new.owner_id is not null then
    insert into public.activity(commitment_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'commitment_assigned', jsonb_build_object('title', new.title, 'to', new.owner_id));
    if new.owner_id is distinct from actor and not private.is_agent(new.owner_id) then
      insert into public.notifications(person_id, commitment_id, actor_id, kind, body) values (new.owner_id, new.id, actor, 'commitment', new.title);
    end if;
  end if;
  if new.due is distinct from old.due then
    insert into public.activity(commitment_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'commitment_due', jsonb_build_object('title', new.title, 'from', old.due, 'to', new.due));
  end if;
  return new;
end $$;

-- Projects: opening, a change of lead or health, and archiving go to the log ("since you were here", the command view).
create or replace function public.log_project() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  actor uuid := private.actor();
begin
  if tg_op = 'INSERT' then
    insert into public.activity(project_id, actor_id, kind, payload) values (new.id, actor, 'project_new', jsonb_build_object('title', new.name));
    return new;
  end if;
  if new.health is distinct from old.health then
    insert into public.activity(project_id, actor_id, kind, payload)
      values (new.id, actor, 'project_health', jsonb_build_object('title', new.name, 'from', old.health, 'to', new.health, 'note', new.health_note));
  end if;
  if new.owner_id is distinct from old.owner_id and new.owner_id is not null then
    insert into public.activity(project_id, actor_id, kind, payload)
      values (new.id, actor, 'project_lead', jsonb_build_object('title', new.name, 'to', new.owner_id));
  end if;
  if new.archived and not old.archived then
    insert into public.activity(project_id, actor_id, kind, payload) values (new.id, actor, 'project_archived', jsonb_build_object('title', new.name));
  end if;
  return new;
end $$;

-- Ideas: a new idea goes to the log.
create or replace function public.log_idea() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  insert into public.activity(actor_id, kind, payload) values (private.actor(), 'idea_new', jsonb_build_object('title', new.title, 'idea_id', new.id));
  return new;
end $$;

create trigger decisions_log after insert or update on public.decisions for each row execute function public.log_decision();
create trigger commitments_log after insert or update on public.commitments for each row execute function public.log_commitment();
create trigger projects_log after insert or update on public.projects for each row execute function public.log_project();
create trigger ideas_log after insert on public.ideas for each row execute function public.log_idea();

revoke execute on function public.touch() from public, anon, authenticated;
revoke execute on function public.log_task() from public, anon, authenticated;
revoke execute on function public.log_comment() from public, anon, authenticated;
revoke execute on function public.log_decision() from public, anon, authenticated;
revoke execute on function public.log_commitment() from public, anon, authenticated;
revoke execute on function public.log_project() from public, anon, authenticated;
revoke execute on function public.log_idea() from public, anon, authenticated;
revoke execute on function public.guard_agent() from public, anon, authenticated;
