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
  person_id uuid not null references public.people(id) on delete cascade,
  role text not null,
  title text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organisation_memberships_status_check check (status in ('active', 'deleted', 'disabled', 'invited')),
  constraint organisation_memberships_role_check check (role in (
    'platform_owner',
    'platform_admin',
    'retail_admin',
    'retail_agent',
    'retail_assistant'
  ))
);

create unique index if not exists organisation_memberships_person_org_idx
  on public.organisation_memberships (person_id, organisation_id);

create index if not exists organisation_memberships_org_status_idx
  on public.organisation_memberships (organisation_id, status, role);

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
  drop constraint if exists organisation_memberships_status_check;

update public.organisation_memberships
set status = 'deleted'
where metadata ? 'deletedAt'
  and status <> 'deleted';

alter table public.organisation_memberships
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
  and organisation_memberships.role not in (
    'platform_owner',
    'platform_admin',
    'retail_admin',
    'retail_agent',
    'retail_assistant'
  );

alter table public.organisation_memberships
  add constraint organisation_memberships_role_check check (role in (
    'platform_owner',
    'platform_admin',
    'retail_admin',
    'retail_agent',
    'retail_assistant'
  ));

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
  add column if not exists person_id uuid references public.people(id) on delete set null;

create index if not exists agents_organisation_idx
  on public.agents (organisation_id, status, updated_at desc);

create index if not exists agents_person_idx
  on public.agents (person_id)
  where person_id is not null;
`;
