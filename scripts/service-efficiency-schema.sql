-- Additive: old applications keep working; stale projections fall back to reads.
alter table public.agentic_plan_revisions add column if not exists status_projection jsonb;
alter table public.agentic_plan_operations add column if not exists read_projection jsonb;

create or replace function public.project_agentic_operation_read() returns trigger language plpgsql as $$
begin
  new.read_projection := jsonb_build_object('id',new.id,'status',new.status,
    'revision',new.record_json->'revision','expectedRevision',new.record_json->'expectedRevision',
    'error',new.record_json->'error','createdAt',new.record_json->'createdAt','deadlineAt',new.record_json->'deadlineAt');
  return new;
end $$;
drop trigger if exists project_agentic_operation_read on public.agentic_plan_operations;
create trigger project_agentic_operation_read before insert or update of status,record_json on public.agentic_plan_operations
  for each row execute function public.project_agentic_operation_read();

create or replace function public.invalidate_legacy_plan_projection() returns trigger language plpgsql as $$
begin
  if new.result is distinct from old.result and new.status_projection is not distinct from old.status_projection then
    new.status_projection := null;
  end if;
  return new;
end $$;
drop trigger if exists invalidate_legacy_plan_projection on public.agentic_plan_revisions;
create trigger invalidate_legacy_plan_projection before update of result on public.agentic_plan_revisions
  for each row execute function public.invalidate_legacy_plan_projection();
