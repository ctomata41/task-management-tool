-- Removing an item that was marked as possibly classified. Command members (is_command) blank its text everywhere
-- a copy of it was kept (the item, the activity log and notifications) and archive it. Clearing the mark is a plain update.
create or replace function public.redact_item(item_kind text, item_id uuid) returns boolean
language plpgsql security definer set search_path to '' as $$
declare
  actor uuid := private.actor();
  gone constant text := '[הוסר: חשד למידע מסווג]';
begin
  if not public.has_team_code() then return false; end if;
  if actor is null or not exists (select 1 from public.people where id = actor and is_command and not archived) then
    raise exception 'רק הפיקוד מסיר תוכן';
  end if;
  if item_kind = 'task' then
    update public.tasks set title = gone, notes = null, blocked_reason = null, done_def = null, evidence = null,
      flagged = false, archived = true where id = item_id;
    update public.checklist set title = gone where task_id = item_id;
    update public.comments set body = gone where task_id = item_id;
    update public.activity set payload = jsonb_build_object('title', gone) where task_id = item_id;
    update public.notifications set body = gone where task_id = item_id;
  elsif item_kind = 'comment' then
    update public.activity a set payload = a.payload || jsonb_build_object('body', gone)
      from public.comments c
      where c.id = item_id and a.task_id = c.task_id and a.kind = 'comment' and a.payload ->> 'body' = left(c.body, 200);
    update public.notifications n set body = gone
      from public.comments c
      where c.id = item_id and n.task_id = c.task_id and n.kind in ('comment', 'mention') and n.body = left(c.body, 200);
    update public.comments set body = gone, flagged = false where id = item_id;
  elsif item_kind = 'decision' then
    update public.decisions set title = gone, context = null, options = '[]', reason = null, unblocks = null,
      chosen_label = null, rationale = null, flagged = false, archived = true where id = item_id;
    update public.activity set payload = jsonb_build_object('title', gone) where decision_id = item_id;
    update public.notifications set body = gone where decision_id = item_id;
  elsif item_kind = 'commitment' then
    update public.commitments set title = gone, counterpart = null, contact = null, notes = null,
      flagged = false, archived = true where id = item_id;
    update public.activity set payload = jsonb_build_object('title', gone) where commitment_id = item_id;
    update public.notifications set body = gone where commitment_id = item_id;
  elsif item_kind = 'idea' then
    update public.ideas set title = gone, notes = null, flagged = false, archived = true where id = item_id;
    update public.activity set payload = jsonb_build_object('title', gone) where kind = 'idea_new' and payload ->> 'idea_id' = item_id::text;
  elsif item_kind = 'project' then
    update public.projects set name = gone, description = null, brief = null, health_note = null, stakeholders = null,
      risks = null, milestones = '[]', links = '[]', goals = null, status_today = null, flagged = false, archived = true
      where id = item_id;
    update public.activity set payload = jsonb_build_object('title', gone)
      where project_id = item_id and task_id is null and decision_id is null and commitment_id is null;
  else
    raise exception 'unknown item kind %', item_kind;
  end if;
  return true;
end $$;
