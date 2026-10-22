-- Additive: historical assessments keep their original identity until resumed.
alter table public.assessments add column if not exists journey_version text;
alter table public.assessments add column if not exists acquisition_attribution jsonb;
alter table public.assessments add column if not exists funnel_skip_healthscore boolean;

create or replace function public.project_funnel_assessment_read() returns trigger language plpgsql as $$
begin
  new.funnel_skip_healthscore := coalesce(new.answers ? 'inStorePharmacy', false)
    or coalesce(new.journey_version = 'web-products-v1', false);
  return new;
end $$;
drop trigger if exists project_funnel_assessment_read on public.assessments;
create trigger project_funnel_assessment_read before insert or update of answers, journey_version on public.assessments
  for each row execute function public.project_funnel_assessment_read();
