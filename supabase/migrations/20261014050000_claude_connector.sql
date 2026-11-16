-- The two-way connection to Claude (spec, chapter 5 "איך Claude מתחבר", phase A).
-- Claude → platform: each person's Claude reports its work through the MCP connector (supabase/functions/mcp): a run
-- (one Claude session working on a project), its progress, the outputs it produced, and the decisions and human steps
-- it needs. Platform → Claude: a run started from the app waits as "queued" until a Claude session claims it, and
-- everything people do in the app (a decision made, a step done, feedback on an output, a stop) is what Claude reads
-- back through the connector.
-- Identity: every person gets their own connector key. Only its SHA-256 is stored; the key itself is shown once.
-- Off until the team turns it on (team_settings.connector_enabled), so nothing reaches Claude before the security
-- officer's approval. Additive only, like the earlier migrations, so the live app keeps working.

-- ---------- runs: one Claude session working on a project, as it reports itself ----------
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null default public.default_team() references public.teams(id),
  project_id uuid references public.projects(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,      -- the Claude task it works on, when there is one
  person_id uuid not null references public.people(id) on delete cascade, -- the accountable person: Claude works for them
  title text not null,
  brief text,                                -- what Claude was asked to do
  state text not null default 'running' check (state in ('queued', 'running', 'waiting', 'review', 'done', 'stopped')),
  progress real not null default 0 check (progress between 0 and 1),
  step text,                                 -- what it is doing right now, in a few words
  surface text,                              -- claude.ai | claude-code | cowork | other
  session_url text,                          -- a link back to the conversation or session
  summary text,                              -- the hand-off: where it stopped and what comes next
  stop_requested boolean not null default false, -- a person asked it to stop; Claude reads this and stops
  source text not null default 'claude' check (source in ('claude', 'app')), -- app = launched from the platform
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz,                  -- the last time this session reported anything
  archived boolean not null default false
);
create index runs_team_state_idx on public.runs (team_id, state);
create index runs_project_id_idx on public.runs (project_id);
create index runs_person_id_idx on public.runs (person_id);
create index runs_task_id_idx on public.runs (task_id);
create index runs_created_by_idx on public.runs (created_by);

-- ---------- outputs: what Claude produced, with a link, waiting for a person's look ----------
create table public.outputs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null default public.default_team() references public.teams(id),
  project_id uuid references public.projects(id) on delete set null,
  run_id uuid references public.runs(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  kind text not null default 'doc' check (kind in ('doc', 'video', 'research', 'code', 'app', 'deck', 'chart', 'report', 'image', 'other')),
  title text not null,
  summary text,
  url text,
  status text not null default 'review' check (status in ('review', 'approved', 'changes', 'info')),
  feedback text,                             -- what the reviewer asked to change; Claude reads it back
  created_by uuid references public.people(id) on delete set null, -- the accountable person
  reviewed_by uuid references public.people(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived boolean not null default false
);
create index outputs_project_id_idx on public.outputs (project_id);
create index outputs_run_id_idx on public.outputs (run_id);
create index outputs_task_id_idx on public.outputs (task_id);
create index outputs_created_by_idx on public.outputs (created_by);
create index outputs_reviewed_by_idx on public.outputs (reviewed_by);

-- What a run waits on: the decision or human step it opened.
alter table public.decisions add column run_id uuid references public.runs(id) on delete set null;
alter table public.tasks add column run_id uuid references public.runs(id) on delete set null;
create index decisions_run_id_idx on public.decisions (run_id);
create index tasks_run_id_idx on public.tasks (run_id);

alter table public.activity
  add column run_id uuid references public.runs(id) on delete cascade,
  add column output_id uuid references public.outputs(id) on delete cascade;
alter table public.notifications
  add column run_id uuid references public.runs(id) on delete cascade,
  add column output_id uuid references public.outputs(id) on delete cascade;
create index activity_run_id_idx on public.activity (run_id);
create index activity_output_id_idx on public.activity (output_id);
create index notifications_run_id_idx on public.notifications (run_id);
create index notifications_output_id_idx on public.notifications (output_id);

alter table public.runs enable row level security;
alter table public.outputs enable row level security;
create policy team_all on public.runs for all to anon, authenticated using ((select public.has_team_code())) with check ((select public.has_team_code()));
create policy team_all on public.outputs for all to anon, authenticated using ((select public.has_team_code())) with check ((select public.has_team_code()));

create trigger runs_touch before update on public.runs for each row execute function public.touch();
create trigger outputs_touch before update on public.outputs for each row execute function public.touch();
-- An agent never deletes and never approves its own output.
create or replace function public.guard_agent_output() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if not private.is_agent(private.actor()) then return new; end if;
  if tg_op = 'UPDATE' and new.archived and not old.archived then
    raise exception 'סוכן לא מוחק. מחיקה נעשית רק בידי אדם.';
  end if;
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    raise exception 'רק אדם מאשר תוצר.';
  end if;
  return new;
end $$;
create trigger outputs_guard_agent before insert or update on public.outputs for each row execute function public.guard_agent_output();
-- A run: an agent never deletes one and never takes back a person's stop.
create or replace function public.guard_agent_run() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if not private.is_agent(private.actor()) then return new; end if;
  if new.archived and not old.archived then
    raise exception 'סוכן לא מוחק. מחיקה נעשית רק בידי אדם.';
  end if;
  if old.stop_requested and not new.stop_requested then
    raise exception 'אדם ביקש לעצור את הריצה. רק אדם ממשיך אותה.';
  end if;
  return new;
end $$;
create trigger runs_guard_agent before update on public.runs for each row execute function public.guard_agent_run();

-- ---------- the log: what Claude did shows in the project's story, and an output reaches the person it is for ----------
create or replace function public.log_run() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  actor uuid := private.actor();
begin
  if tg_op = 'INSERT' then
    insert into public.activity(run_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'run_' || new.state, jsonb_build_object('title', new.title, 'source', new.source));
    return new;
  end if;
  if new.state is distinct from old.state then
    insert into public.activity(run_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'run_' || new.state, jsonb_build_object('title', new.title, 'step', new.step));
  end if;
  if new.stop_requested and not old.stop_requested then
    insert into public.activity(run_id, project_id, actor_id, kind, payload)
      values (new.id, new.project_id, actor, 'run_stop_requested', jsonb_build_object('title', new.title));
  end if;
  return new;
end $$;
create trigger runs_log after insert or update on public.runs for each row execute function public.log_run();

create or replace function public.log_output() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  actor uuid := private.actor();
begin
  if tg_op = 'INSERT' then
    insert into public.activity(output_id, run_id, project_id, actor_id, kind, payload)
      values (new.id, new.run_id, new.project_id, actor, 'output_new', jsonb_build_object('title', new.title, 'kind', new.kind, 'url', new.url));
    -- The person it was made for hears about it in the daily digest, not as an interruption (the AI constitution: restraint).
    if new.created_by is not null and new.created_by is distinct from actor and not private.is_agent(new.created_by) then
      insert into public.notifications(person_id, output_id, run_id, actor_id, kind, body) values (new.created_by, new.id, new.run_id, actor, 'output', new.title);
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.activity(output_id, run_id, project_id, actor_id, kind, payload)
      values (new.id, new.run_id, new.project_id, actor, 'output_' || new.status, jsonb_build_object('title', new.title, 'feedback', left(new.feedback, 300)));
  end if;
  return new;
end $$;
create trigger outputs_log after insert or update on public.outputs for each row execute function public.log_output();

-- ---------- personal connector keys ----------
alter table public.team_settings add column connector_enabled boolean not null default false;

create table private.connector_keys (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  key_hash text not null unique,             -- SHA-256 of the key; the key itself is never stored
  label text,                                -- for example "claude.ai" or "Claude Code on the laptop"
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index connector_keys_person_id_idx on private.connector_keys (person_id);

-- A person makes a key for themselves (the app sends who is acting in x-actor). The key is returned once.
create or replace function public.connector_key_create(p_label text default null) returns text
language plpgsql security definer set search_path to '' as $$
declare
  me uuid := private.actor();
  k text;
begin
  if not public.has_team_code() then raise exception 'not allowed'; end if;
  if me is null or private.is_agent(me) or not exists (select 1 from public.people where id = me and is_team and not archived) then
    raise exception 'רק אדם מהצוות יוצר מפתח, לעצמו.';
  end if;
  if (select count(*) from private.connector_keys where person_id = me and revoked_at is null) >= 5 then
    raise exception 'יש כבר 5 מפתחות פעילים. כדאי לבטל אחד קודם.';
  end if;
  k := 'cto_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.connector_keys(person_id, key_hash, label) values (me, private.code_hash(k), left(p_label, 60));
  return k;
end $$;

create or replace function public.connector_keys_mine()
returns table (id uuid, label text, created_at timestamptz, last_used_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select k.id, k.label, k.created_at, k.last_used_at from private.connector_keys k
  where public.has_team_code() and k.person_id = private.actor() and k.revoked_at is null
  order by k.created_at desc
$$;

create or replace function public.connector_key_revoke(p_id uuid) returns boolean
language plpgsql security definer set search_path to '' as $$
begin
  if not public.has_team_code() then raise exception 'not allowed'; end if;
  update private.connector_keys set revoked_at = now()
    where id = p_id and person_id = private.actor() and revoked_at is null;
  return found;
end $$;

-- The connector (service role only) turns a key into a person, and refuses while the team has not turned it on.
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
  update private.connector_keys set last_used_at = now() where id = kid and (last_used_at is null or last_used_at < now() - interval '5 minutes');
  return query
    select p.id, p.name, p.team_id,
      (select a.id from public.people a where a.is_agent and a.team_id = p.team_id and not a.archived order by a.created_at limit 1),
      coalesce((select s.connector_enabled from public.team_settings s where s.team_id = p.team_id), false)
    from public.people p where p.id = pid and not p.archived;
end $$;

revoke execute on function public.log_run() from public, anon, authenticated;
revoke execute on function public.log_output() from public, anon, authenticated;
revoke execute on function public.guard_agent_output() from public, anon, authenticated;
revoke execute on function public.guard_agent_run() from public, anon, authenticated;
revoke execute on function public.connector_whoami(text) from public, anon, authenticated;
grant execute on function public.connector_whoami(text) to service_role;
revoke execute on function public.connector_key_create(text) from public;
revoke execute on function public.connector_keys_mine() from public;
revoke execute on function public.connector_key_revoke(uuid) from public;
grant execute on function public.connector_key_create(text) to anon, authenticated;
grant execute on function public.connector_keys_mine() to anon, authenticated;
grant execute on function public.connector_key_revoke(uuid) to anon, authenticated;
