/** Isolated admin browser scaffolding. Existing catalogue fixtures stay current. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAdminSession } from '../../lib/admin-access.ts';
import { getSql } from '../../lib/db.ts';
import { fixtureDatabaseUrl } from './fixture-teardown.ts';

export type AdminBrowserSession = Readonly<{
  csrfToken: string;
  organisationId: string;
  sessionCookie: string;
  sessionId: string;
  testOrganisationId: string;
  testOrganisationName: string;
  ownsTestOrganisation: boolean;
}>;

export async function createAdminBrowserSession(targetOrganisationId?: string): Promise<AdminBrowserSession> {
  fixtureDatabaseUrl();
  assert.match(process.env.ADMIN_SESSION_SECRET ?? '', /^fixture-[a-f0-9]{64}$/, 'Admin browser sessions require a fixture-only signing secret');
  const sql = getSql()!;
  const [owner] = await sql<Array<{ person_id: string; organisation_id: string }>>`
    select m.person_id::text as person_id, m.organisation_id::text as organisation_id
    from public.organisation_memberships m
    join public.people p on p.id=m.person_id join public.organisations o on o.id=m.organisation_id
    where m.role='platform_owner' and m.status='active' and p.status='active' and o.status='active'
    order by m.created_at asc limit 1`;
  assert.ok(owner, 'No active platform owner membership found');
  let target: { id: string; name: string };
  if (targetOrganisationId) {
    assert.match(targetOrganisationId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    const [existing] = await sql<Array<{ id: string; name: string }>>`
      select id::text,name from public.organisations where id=${targetOrganisationId}::uuid
        and organisation_type='tenant' and status='active' and metadata->>'source'='browser-admin-target-fixture'`;
    assert.ok(existing, 'Supplied admin target must be the preprovisioned browser fixture');
    target = existing;
  } else {
    const suffix = randomUUID().slice(0, 8);
    const [created] = await sql<Array<{ id: string; name: string }>>`
      insert into public.organisations (slug,name,organisation_type,status,default_locale,metadata)
      values (${`e2e-associate-agent-${suffix}`},${`E2E Associate Agent ${suffix}`},'tenant','active','en','{"source":"admin-associate-agent-e2e"}'::jsonb)
      returning id::text,name`;
    assert.ok(created, 'Unable to create standalone admin target');
    target = created;
  }
  const session = await createAdminSession({ organisationId: owner.organisation_id, personId: owner.person_id });
  assert.ok(session.context.sessionId, "Created admin session must have a durable ID");
  return { csrfToken: session.csrfToken, organisationId: owner.organisation_id, sessionCookie: session.sessionCookie,
    sessionId: session.context.sessionId, testOrganisationId: target.id, testOrganisationName: target.name,
    ownsTestOrganisation: !targetOrganisationId };
}

export async function cleanupAdminBrowserSession(session: AdminBrowserSession) {
  fixtureDatabaseUrl();
  const sql = getSql()!;
  await sql`update public.admin_sessions set revoked_at=coalesce(revoked_at,now()) where id=${session.sessionId}::uuid`;
  await sql`delete from public.organisation_memberships where organisation_id=${session.testOrganisationId}::uuid and principal_type='agent'`;
  if (session.ownsTestOrganisation) {
    await sql`delete from public.organisations where id=${session.testOrganisationId}::uuid and metadata->>'source'='admin-associate-agent-e2e'`;
  }
}
