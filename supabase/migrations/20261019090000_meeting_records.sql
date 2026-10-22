-- Meetings: a person presses record, the platform transcribes the meeting in Hebrew (ElevenLabs Scribe, in the
-- browser), keeps the transcript here, and writes a discussion summary. The transcript and the summary are outputs of
-- the project: an output row links to the meeting's page, where both are read and downloaded as text.
-- A meeting on a personal project is hidden like the rest of that project.

create table if not exists public.meeting_records (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null default public.default_team(),
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  transcript text not null default '',
  summary jsonb,
  status text not null default 'recording' check (status in ('recording', 'saved', 'summarized')),
  output_id uuid references public.outputs(id) on delete set null,
  created_by uuid references public.people(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived boolean not null default false
);
create index if not exists meeting_records_project on public.meeting_records(project_id) where not archived;

alter table public.meeting_records enable row level security;
drop policy if exists team_all on public.meeting_records;
create policy team_all on public.meeting_records for all
  using ((select public.has_team_code()) and (project_id is null or private.can_see_project(project_id)))
  with check ((select public.has_team_code()));

drop trigger if exists meeting_records_touch on public.meeting_records;
create trigger meeting_records_touch before update on public.meeting_records for each row execute function public.touch();

grant select, insert, update on public.meeting_records to anon, authenticated;
grant all on public.meeting_records to service_role;
