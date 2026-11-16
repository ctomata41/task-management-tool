-- Personal projects and work plans built with Claude.
-- A personal project is seen only by its owner: the project and everything in it (decisions, steps, Claude's runs and
-- outputs, the activity line). The database enforces it, not the screen. Until per-person sign-in replaces the team code,
-- "the owner" is the person the browser says it acts for (x-actor), so this keeps a project out of the others' screens
-- but is not a lock against someone who sets out to read it.
-- A plan is what Claude writes with set_plan: a short summary, the phases (the project's milestones) and the steps,
-- kept as tasks (human steps for people, Claude steps for Claude).

alter table public.projects add column if not exists personal boolean not null default false;
alter table public.projects add column if not exists claude_project_url text;
alter table public.projects add column if not exists plan_summary text;
alter table public.projects add column if not exists plan_updated_at timestamptz;

create or replace function private.can_see_project(pid uuid) returns boolean
language sql stable security definer set search_path to '' as $$
  select coalesce((select not p.personal or p.owner_id = private.actor() from public.projects p where p.id = pid), true)
$$;

drop policy if exists team_all on public.projects;
create policy team_all on public.projects for all
  using ((select public.has_team_code()) and (not personal or owner_id = (select private.actor())))
  with check ((select public.has_team_code()));

drop policy if exists team_all on public.tasks;
create policy team_all on public.tasks for all
  using ((select public.has_team_code()) and (project_id is null or private.can_see_project(project_id)))
  with check ((select public.has_team_code()));

drop policy if exists team_all on public.decisions;
create policy team_all on public.decisions for all
  using ((select public.has_team_code()) and (project_id is null or private.can_see_project(project_id)))
  with check ((select public.has_team_code()));

drop policy if exists team_all on public.runs;
create policy team_all on public.runs for all
  using ((select public.has_team_code()) and (project_id is null or private.can_see_project(project_id)))
  with check ((select public.has_team_code()));

drop policy if exists team_all on public.outputs;
create policy team_all on public.outputs for all
  using ((select public.has_team_code()) and (project_id is null or private.can_see_project(project_id)))
  with check ((select public.has_team_code()));

drop policy if exists team_read on public.activity;
create policy team_read on public.activity for select
  using ((select public.has_team_code()) and (project_id is null or private.can_see_project(project_id)));

-- Only the owner turns a project personal or back.
create or replace function private.guard_personal() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.personal is distinct from old.personal and old.owner_id is distinct from private.actor() then
    raise exception 'רק מי שמוביל את הפרויקט יכול להפוך אותו לאישי או לשתף אותו.';
  end if;
  return new;
end $$;
drop trigger if exists projects_guard_personal on public.projects;
create trigger projects_guard_personal before update on public.projects for each row execute function private.guard_personal();

-- The agent guard read new.status on every table it guards, so Claude could not update a project (projects have no
-- status column), which set_plan needs for the milestones and the plan summary. Same rules, checked per table.
create or replace function public.guard_agent() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if not private.is_agent(private.actor()) then return new; end if;
  if tg_op = 'UPDATE' and new.archived and not old.archived then
    raise exception 'סוכן לא מוחק. מחיקה נעשית רק בידי אדם.';
  end if;
  if tg_table_name = 'tasks' then
    if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
      raise exception 'סוכן לא סוגר משימה. מגישים לבדיקה, ואדם מאשר.';
    end if;
  elsif tg_table_name = 'decisions' then
    if new.status = 'decided' and (tg_op = 'INSERT' or old.status is distinct from 'decided') then
      raise exception 'רק אדם מחליט.';
    end if;
  elsif tg_table_name = 'commitments' then
    if new.status <> 'open' and (tg_op = 'INSERT' or old.status = 'open') then
      raise exception 'רק אדם סוגר התחייבות.';
    end if;
  elsif tg_table_name = 'projects' then
    if tg_op = 'UPDATE' and new.personal is distinct from old.personal then
      raise exception 'רק אדם הופך פרויקט לאישי או משתף אותו.';
    end if;
  end if;
  return new;
end $$;
