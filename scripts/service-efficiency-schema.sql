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

-- Funnel readers use compact immutable result facts. Older writers invalidate
-- advice projections; the read fallback preserves complete-advice semantics.
alter table public.assessment_healthscore_results add column if not exists read_projection jsonb;
alter table public.formulations add column if not exists read_projection jsonb;
alter table public.assessments add column if not exists funnel_skip_healthscore boolean;

create or replace function public.invalidate_legacy_healthscore_projection() returns trigger language plpgsql as $$
begin
  if new.result is distinct from old.result and new.read_projection is not distinct from old.read_projection then
    new.read_projection := null;
  end if;
  return new;
end $$;
drop trigger if exists invalidate_legacy_healthscore_projection on public.assessment_healthscore_results;
create trigger invalidate_legacy_healthscore_projection before update of result on public.assessment_healthscore_results
  for each row execute function public.invalidate_legacy_healthscore_projection();

create or replace function public.project_funnel_formulation_read() returns trigger language plpgsql as $$
begin
  new.read_projection := jsonb_build_object('version',1,
    'sectionStatus',new.formulation #>> '{sectionStatuses,supplements}',
    'visibleCount',(select count(*)::int from jsonb_array_elements(coalesce(new.formulation->'supplementBreakdown','[]'::jsonb)) item
      where coalesce(item #>> '{safety,visibility}','visible')<>'hidden'));
  return new;
end $$;
drop trigger if exists project_funnel_formulation_read on public.formulations;
create trigger project_funnel_formulation_read before insert or update of formulation on public.formulations
  for each row execute function public.project_funnel_formulation_read();

create or replace function public.project_funnel_assessment_read() returns trigger language plpgsql as $$
begin
  new.funnel_skip_healthscore := coalesce(new.answers ? 'inStorePharmacy',false);
  return new;
end $$;
drop trigger if exists project_funnel_assessment_read on public.assessments;
create trigger project_funnel_assessment_read before insert or update of answers on public.assessments
  for each row execute function public.project_funnel_assessment_read();

-- Freeze the immutable presentation/hash once, without copying baskets on polls.
alter table public.agentic_orders add column if not exists read_projection jsonb;
create or replace function public.project_agentic_order_read() returns trigger language plpgsql as $$
begin
  new.read_projection := jsonb_build_object('version',1,'frozenHash',md5(new.frozen_plan::text),
    'presentation',jsonb_build_object('channel',new.frozen_plan->'channel','subtotalMinor',new.frozen_plan->'subtotalMinor',
      'shippingMinor',new.frozen_plan->'shippingMinor','taxMinor',new.frozen_plan->'taxMinor'));
  return new;
end $$;
drop trigger if exists project_agentic_order_read on public.agentic_orders;
create trigger project_agentic_order_read before insert or update of frozen_plan on public.agentic_orders
  for each row execute function public.project_agentic_order_read();
