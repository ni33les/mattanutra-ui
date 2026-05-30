export const adminAccessSchemaSql = `
create table if not exists public.organisations (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  organisation_type text not null default 'tenant',
  status text not null default 'active',
  default_locale text not null default 'en' references public.site_locales(code),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisations_type_check check (organisation_type in ('platform', 'tenant')),
  constraint organisations_status_check check (status in ('active', 'disabled', 'archived'))
);

create unique index if not exists organisations_slug_idx
  on public.organisations (lower(slug));

alter table public.organisations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  preferred_locale text not null default 'en' references public.site_locales(code),
  status text not null default 'invited',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_status_check check (status in ('active', 'disabled', 'invited'))
);

create unique index if not exists people_email_idx
  on public.people (lower(email));

create table if not exists public.organisation_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  principal_type text not null default 'person',
  person_id uuid references public.people(id) on delete cascade,
  role text not null,
  title text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_memberships_principal_type_check check (principal_type in ('person', 'agent')),
  constraint organisation_memberships_status_check check (status in ('active', 'deleted', 'disabled', 'invited')),
  constraint organisation_memberships_role_check check (
    (principal_type = 'person' and role in (
      'platform_owner',
      'platform_admin',
      'retail_admin',
      'retail_agent',
      'retail_assistant'
    ))
    or
    (principal_type = 'agent' and role in (
      'platform_agent',
      'retail_agent'
    ))
  )
);

alter table public.organisation_memberships
  add column if not exists principal_type text not null default 'person';

alter table public.organisation_memberships
  alter column person_id drop not null;

create unique index if not exists organisation_memberships_person_org_active_idx
  on public.organisation_memberships (person_id, organisation_id)
  where principal_type = 'person' and status <> 'deleted';

create index if not exists organisation_memberships_org_status_idx
  on public.organisation_memberships (organisation_id, principal_type, status, role);

create table if not exists public.admin_passkey_credentials (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  credential_id text not null,
  credential_public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}'::text[],
  device_type text,
  backed_up boolean not null default false,
  label text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_passkey_credentials_credential_idx
  on public.admin_passkey_credentials (credential_id);

create index if not exists admin_passkey_credentials_person_idx
  on public.admin_passkey_credentials (person_id, updated_at desc);

create table if not exists public.admin_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge text not null,
  challenge_type text not null,
  person_id uuid references public.people(id) on delete cascade,
  email text,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint admin_auth_challenges_type_check check (challenge_type in ('authentication', 'registration'))
);

create index if not exists admin_auth_challenges_lookup_idx
  on public.admin_auth_challenges (id, challenge_type, expires_at)
  where consumed_at is null;

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null,
  person_id uuid not null references public.people(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  assumed_person_id uuid references public.people(id) on delete set null,
  assumed_organisation_id uuid references public.organisations(id) on delete set null,
  csrf_token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists admin_sessions_hash_idx
  on public.admin_sessions (session_hash);

create index if not exists admin_sessions_person_active_idx
  on public.admin_sessions (person_id, expires_at desc)
  where revoked_at is null;

create table if not exists public.admin_invitations (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  email text not null,
  role text not null,
  invited_by_person_id uuid references public.people(id) on delete set null,
  token_hash text not null,
  preferred_locale text not null default 'en' references public.site_locales(code),
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_invitations_status_check check (status in ('accepted', 'expired', 'pending', 'revoked')),
  constraint admin_invitations_role_check check (role in (
    'platform_owner',
    'platform_admin',
    'retail_admin',
    'retail_agent',
    'retail_assistant'
  ))
);

create unique index if not exists admin_invitations_token_idx
  on public.admin_invitations (token_hash);

create index if not exists admin_invitations_org_status_idx
  on public.admin_invitations (organisation_id, status, created_at desc);

alter table public.organisation_memberships
  add column if not exists principal_type text not null default 'person';

alter table public.organisation_memberships
  alter column person_id drop not null;

update public.organisation_memberships
set principal_type = 'person'
where principal_type is distinct from 'person'
  and person_id is not null;

alter table public.organisation_memberships
  drop constraint if exists organisation_memberships_principal_type_check,
  drop constraint if exists organisation_memberships_status_check;

update public.organisation_memberships
set status = 'deleted'
where metadata ? 'deletedAt'
  and status <> 'deleted';

alter table public.organisation_memberships
  add constraint organisation_memberships_principal_type_check check (principal_type in ('person', 'agent')),
  add constraint organisation_memberships_status_check check (status in (
    'active',
    'deleted',
    'disabled',
    'invited'
  ));

alter table public.organisation_memberships
  drop constraint if exists organisation_memberships_role_check;

update public.organisation_memberships
set role = case
  when organisation_memberships.role = 'platform_owner' then 'platform_owner'
  when organisations.organisation_type = 'platform' then 'platform_admin'
  when organisation_memberships.role in ('tenant_admin', 'tenant', 'retail_admin') then 'retail_admin'
  when organisation_memberships.role in ('retail_agent') then 'retail_agent'
  else 'retail_assistant'
end
from public.organisations
where organisations.id = organisation_memberships.organisation_id
  and organisation_memberships.principal_type = 'person'
  and organisation_memberships.role not in (
    'platform_owner',
    'platform_admin',
    'retail_admin',
    'retail_agent',
    'retail_assistant'
  );

alter table public.organisation_memberships
  add constraint organisation_memberships_role_check check (
    (principal_type = 'person' and role in (
      'platform_owner',
      'platform_admin',
      'retail_admin',
      'retail_agent',
      'retail_assistant'
    ))
    or
    (principal_type = 'agent' and role in (
      'platform_agent',
      'retail_agent'
    ))
  );

alter table public.admin_invitations
  drop constraint if exists admin_invitations_role_check;

update public.admin_invitations
set role = case
  when admin_invitations.role = 'platform_owner' then 'platform_owner'
  when organisations.organisation_type = 'platform' then 'platform_admin'
  when admin_invitations.role in ('tenant_admin', 'tenant', 'retail_admin') then 'retail_admin'
  when admin_invitations.role in ('retail_agent') then 'retail_agent'
  else 'retail_assistant'
end
from public.organisations
where organisations.id = admin_invitations.organisation_id
  and admin_invitations.role not in (
    'platform_owner',
    'platform_admin',
    'retail_admin',
    'retail_agent',
    'retail_assistant'
  );

alter table public.admin_invitations
  add constraint admin_invitations_role_check check (role in (
    'platform_owner',
    'platform_admin',
    'retail_admin',
    'retail_agent',
    'retail_assistant'
  ));

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id) on delete set null,
  actor_person_id uuid references public.people(id) on delete set null,
  assumed_person_id uuid references public.people(id) on delete set null,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_created_idx
  on public.admin_audit_events (created_at desc);

create index if not exists admin_audit_events_actor_idx
  on public.admin_audit_events (actor_person_id, created_at desc);

insert into public.organisations (
  slug,
  name,
  organisation_type,
  status,
  default_locale
)
values (
  'mattanutra',
  'MattaNutra',
  'platform',
  'active',
  'en'
)
on conflict do nothing;

alter table public.agents
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists person_id uuid references public.people(id) on delete set null,
  add column if not exists role text not null default 'platform_agent';

alter table public.agents
  drop constraint if exists agents_role_check;

update public.agents
set organisation_id = coalesce(
    organisation_id,
    (select id from public.organisations where slug = 'mattanutra' limit 1)
  ),
  role = case
    when role = 'retail_agent' then 'retail_agent'
    else 'platform_agent'
  end
where organisation_id is null
   or role not in ('platform_agent', 'retail_agent');

alter table public.agents
  add constraint agents_role_check check (role in ('platform_agent', 'retail_agent'));

create index if not exists agents_organisation_idx
  on public.agents (organisation_id, status, updated_at desc);

create index if not exists agents_person_idx
  on public.agents (person_id)
  where person_id is not null;

alter table public.organisation_memberships
  add column if not exists agent_id uuid references public.agents(id) on delete cascade;

update public.organisation_memberships
set principal_type = 'agent'
where agent_id is not null
  and person_id is null
  and principal_type is distinct from 'agent';

insert into public.organisation_memberships (
  organisation_id,
  principal_type,
  agent_id,
  role,
  status,
  title,
  metadata
)
select
  coalesce(
    agents.organisation_id,
    (select id from public.organisations where slug = 'mattanutra' limit 1)
  ),
  'agent',
  agents.id,
  case
    when organisations.organisation_type = 'tenant' then 'retail_agent'
    else 'platform_agent'
  end,
  case when agents.status = 'active' then 'active' else 'disabled' end,
  null,
  jsonb_build_object('backfilledAt', now(), 'source', 'agents')
from public.agents
join public.organisations
  on organisations.id = coalesce(
    agents.organisation_id,
    (select id from public.organisations where slug = 'mattanutra' limit 1)
  )
where not exists (
  select 1
  from public.organisation_memberships existing_memberships
  where existing_memberships.principal_type = 'agent'
    and existing_memberships.agent_id = agents.id
    and existing_memberships.organisation_id = coalesce(
      agents.organisation_id,
      (select id from public.organisations where slug = 'mattanutra' limit 1)
    )
    and existing_memberships.status <> 'deleted'
);

alter table public.organisation_memberships
  drop constraint if exists organisation_memberships_principal_check,
  drop constraint if exists organisation_memberships_role_check;

update public.organisation_memberships
set role = case
  when organisations.organisation_type = 'tenant' then 'retail_agent'
  else 'platform_agent'
end
from public.organisations
where organisations.id = organisation_memberships.organisation_id
  and organisation_memberships.principal_type = 'agent'
  and organisation_memberships.role not in ('platform_agent', 'retail_agent');

alter table public.organisation_memberships
  add constraint organisation_memberships_principal_check check (
    (principal_type = 'person' and person_id is not null and agent_id is null)
    or
    (principal_type = 'agent' and agent_id is not null and person_id is null)
  ),
  add constraint organisation_memberships_role_check check (
    (principal_type = 'person' and role in (
      'platform_owner',
      'platform_admin',
      'retail_admin',
      'retail_agent',
      'retail_assistant'
    ))
    or
    (principal_type = 'agent' and role in (
      'platform_agent',
      'retail_agent'
    ))
  );

drop index if exists organisation_memberships_person_org_idx;

create unique index if not exists organisation_memberships_person_org_active_idx
  on public.organisation_memberships (person_id, organisation_id)
  where principal_type = 'person' and status <> 'deleted';

create unique index if not exists organisation_memberships_agent_org_active_idx
  on public.organisation_memberships (agent_id, organisation_id)
  where principal_type = 'agent' and status <> 'deleted';

create index if not exists organisation_memberships_agent_status_idx
  on public.organisation_memberships (agent_id, status, updated_at desc)
  where principal_type = 'agent';

create table if not exists public.agent_credentials (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  membership_id uuid references public.organisation_memberships(id) on delete set null,
  credential_hash text not null,
  display_prefix text not null,
  label text,
  status text not null default 'active',
  expires_at timestamptz,
  last_used_at timestamptz,
  created_by_person_id uuid references public.people(id) on delete set null,
  revoked_by_person_id uuid references public.people(id) on delete set null,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_credentials_status_check check (status in ('active', 'revoked'))
);

create unique index if not exists agent_credentials_hash_idx
  on public.agent_credentials (credential_hash);

create index if not exists agent_credentials_agent_status_idx
  on public.agent_credentials (agent_id, status, created_at desc);

alter table public.agent_credentials
  add column if not exists membership_id uuid references public.organisation_memberships(id) on delete set null;

update public.agent_credentials
set membership_id = organisation_memberships.id
from public.agents
join public.organisation_memberships
  on organisation_memberships.agent_id = agents.id
  and organisation_memberships.organisation_id = agents.organisation_id
  and organisation_memberships.principal_type = 'agent'
  and organisation_memberships.status <> 'deleted'
where agent_credentials.agent_id = agents.id
  and agent_credentials.membership_id is null;

create index if not exists agent_credentials_membership_status_idx
  on public.agent_credentials (membership_id, status, created_at desc)
  where membership_id is not null;

alter table public.tasks
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null;

update public.tasks
set organisation_id = coalesce(
  organisation_id,
  (select id from public.organisations where slug = 'mattanutra' limit 1)
)
where organisation_id is null;

alter table public.tasks
  drop constraint if exists tasks_organisation_id_fkey;

alter table public.tasks
  alter column organisation_id set not null,
  add constraint tasks_organisation_id_fkey
    foreign key (organisation_id) references public.organisations(id);

create index if not exists tasks_organisation_status_idx
  on public.tasks (organisation_id, status, scheduled_for desc);

alter table public.worker_sessions
  add column if not exists membership_id uuid references public.organisation_memberships(id) on delete restrict;

update public.worker_sessions
set membership_id = organisation_memberships.id
from public.agents
join public.organisation_memberships
  on organisation_memberships.agent_id = agents.id
  and organisation_memberships.organisation_id = coalesce(
    agents.organisation_id,
    (select id from public.organisations where slug = 'mattanutra' limit 1)
  )
  and organisation_memberships.principal_type = 'agent'
  and organisation_memberships.status <> 'deleted'
where worker_sessions.agent_id = agents.id
  and worker_sessions.membership_id is null;

alter table public.worker_sessions
  alter column membership_id set not null;

drop index if exists worker_sessions_agent_instance_idx;

create unique index if not exists worker_sessions_membership_instance_idx
  on public.worker_sessions (membership_id, instance_id);

create index if not exists worker_sessions_agent_idx
  on public.worker_sessions (agent_id, status, last_seen_at desc);

alter table public.task_reservations
  add column if not exists membership_id uuid references public.organisation_memberships(id) on delete restrict;

update public.task_reservations
set membership_id = worker_sessions.membership_id
from public.worker_sessions
where task_reservations.worker_session_id = worker_sessions.id
  and task_reservations.membership_id is null;

update public.task_reservations
set membership_id = organisation_memberships.id
from public.tasks,
  public.organisation_memberships
where task_reservations.task_id = tasks.id
  and organisation_memberships.organisation_id = tasks.organisation_id
  and organisation_memberships.agent_id = task_reservations.agent_id
  and organisation_memberships.principal_type = 'agent'
  and organisation_memberships.status <> 'deleted'
  and task_reservations.membership_id is null;

alter table public.task_reservations
  alter column membership_id set not null;

create index if not exists task_reservations_membership_idx
  on public.task_reservations (membership_id, status, reserved_at desc);
`;
