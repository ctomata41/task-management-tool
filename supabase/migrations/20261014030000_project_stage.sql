-- Projects get a stage. Opening or stopping a project is the one decision that goes up to the commander (spec, round 3):
-- a new project stays "מוצע" (proposed) until its gate decision is answered, and the effect of the chosen option
-- ('open' or 'stop', kept on the option) moves the project. Projects that already exist are active.
alter table public.projects add column stage text not null default 'active' check (stage in ('proposed', 'active', 'stopped'));

-- Prioritizing between projects is decided in the weekly meeting, so it is a decision kind with no single assignee.
alter table public.decisions drop constraint decisions_kind_check;
alter table public.decisions add constraint decisions_kind_check check (kind in ('direction', 'approval', 'gate', 'priority'));

create or replace function public.apply_gate() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  effect text;
begin
  if new.kind <> 'gate' or new.project_id is null or new.status <> 'decided'
     or (tg_op = 'UPDATE' and old.status = 'decided') then
    return new;
  end if;
  select o ->> 'effect' into effect from jsonb_array_elements(new.options) o where o ->> 'key' = new.chosen_key limit 1;
  if effect = 'open' then
    update public.projects set stage = 'active' where id = new.project_id and stage <> 'active';
  elsif effect = 'stop' then
    update public.projects set stage = 'stopped' where id = new.project_id and stage <> 'stopped';
  end if;
  return new;
end $$;
create trigger decisions_apply_gate after insert or update on public.decisions for each row execute function public.apply_gate();

-- The kind of a task follows who does it: an agent owner makes it a Claude task, done for an accountable person
-- (the project lead, else whoever opened it). This keeps tasks consistent when a client that does not know about
-- kinds, like the pilot-1 app, gives a task to Claude or takes it back.
create or replace function public.task_kind() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.owner_id is not null and private.is_agent(new.owner_id) then
    if new.kind <> 'claude' then
      new.kind := 'claude';
      new.htype := 'general';
    end if;
    if new.accountable_id is null then
      new.accountable_id := coalesce((select pr.owner_id from public.projects pr where pr.id = new.project_id), new.created_by, private.actor());
    end if;
  elsif new.kind = 'claude' then
    new.kind := 'human';
  end if;
  return new;
end $$;
create trigger tasks_kind before insert or update on public.tasks for each row execute function public.task_kind();

-- The project log also records stage changes.
create or replace function public.log_project() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  actor uuid := private.actor();
begin
  if tg_op = 'INSERT' then
    insert into public.activity(project_id, actor_id, kind, payload)
      values (new.id, actor, 'project_new', jsonb_build_object('title', new.name, 'stage', new.stage));
    return new;
  end if;
  if new.stage is distinct from old.stage then
    insert into public.activity(project_id, actor_id, kind, payload)
      values (new.id, actor, 'project_stage', jsonb_build_object('title', new.name, 'from', old.stage, 'to', new.stage));
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

revoke execute on function public.apply_gate() from public, anon, authenticated;
revoke execute on function public.task_kind() from public, anon, authenticated;
revoke execute on function public.log_project() from public, anon, authenticated;
