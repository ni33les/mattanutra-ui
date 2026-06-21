import { closeSqlPool, getSql } from "@/lib/db";
import {
  hashAdminToken,
  randomAdminToken
} from "@/lib/admin-session-cookie";
import { recordAdminAudit } from "@/lib/admin-access";
import { sendTransactionalEmail } from "@/lib/smtp-email";
import { siteBaseUrl } from "@/lib/site-url";

const recoveryInviteMinutes = 60;

type Args = Readonly<{
  confirm: boolean;
  email: string;
  json: boolean;
}>;

function parseArgs(argv: readonly string[]): Args {
  let email = "";
  let confirm = false;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--confirm") {
      confirm = true;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--email") {
      email = argv[index + 1]?.trim().toLowerCase() ?? "";
      index += 1;
      continue;
    }

    if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length).trim().toLowerCase();
    }
  }

  return { confirm, email, json };
}

function fail(message: string): never {
  console.error(`[passkey-recovery] ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

if (!process.env.DB_URL?.trim()) {
  fail("DB_URL is required");
}

if (!args.confirm) {
  fail("--confirm is required");
}

if (!args.email || !args.email.includes("@")) {
  fail("--email is required");
}

const sql = getSql();

if (!sql) {
  fail("DB_URL is required");
}

try {
  const token = randomAdminToken();
  const result = await sql.begin(async (transaction) => {
    const targetRows = await transaction<Array<{
      email: string;
      organisation_id: string;
      person_id: string;
      preferred_locale: string;
      role: string;
    }>>`
      select
        people.id::text as person_id,
        people.email,
        people.preferred_locale,
        organisations.id::text as organisation_id,
        organisation_memberships.role
      from public.people
      join public.organisation_memberships
        on organisation_memberships.person_id = people.id
      join public.organisations
        on organisations.id = organisation_memberships.organisation_id
      where lower(people.email) = ${args.email}
        and people.status = 'active'
        and organisations.status = 'active'
        and organisations.organisation_type = 'platform'
        and organisation_memberships.principal_type = 'person'
        and organisation_memberships.role = 'platform_owner'
        and organisation_memberships.status = 'active'
      order by organisation_memberships.created_at asc
      limit 1
    `;
    const target = targetRows[0];

    if (!target) {
      throw new Error("Active platform owner not found");
    }

    await transaction`
      update public.admin_invitations
      set status = 'revoked', updated_at = now()
      where email = ${target.email}
        and status = 'pending'
        and metadata->>'reason' = 'passkey_recovery'
    `;

    const inviteRows = await transaction<Array<{
      email: string;
      expires_at: Date | string;
      id: string;
      organisation_id: string;
      preferred_locale: string;
    }>>`
      insert into public.admin_invitations (
        organisation_id,
        email,
        role,
        invited_by_person_id,
        token_hash,
        preferred_locale,
        status,
        metadata,
        expires_at
      )
      values (
        ${target.organisation_id}::uuid,
        ${target.email},
        ${target.role},
        null,
        ${hashAdminToken(token)},
        ${target.preferred_locale},
        'pending',
        ${transaction.json({
          personId: target.person_id,
          reason: "passkey_recovery",
          source: "break_glass_cli"
        })}::jsonb,
        now() + (${recoveryInviteMinutes}::text || ' minutes')::interval
      )
      returning id::text, organisation_id::text, email, preferred_locale, expires_at
    `;
    const invite = inviteRows[0];

    if (!invite) {
      throw new Error("Unable to create recovery invite");
    }

    await transaction`
      update public.admin_passkey_credentials
      set
        status = 'revoked',
        revoked_at = coalesce(revoked_at, now()),
        revoked_by_person_id = null,
        revoked_invitation_id = ${invite.id}::uuid,
        metadata = metadata || ${transaction.json({
          recoveryInvitationId: invite.id,
          revokedReason: "passkey_recovery",
          revokedSource: "break_glass_cli"
        })}::jsonb,
        updated_at = now()
      where person_id = ${target.person_id}::uuid
        and status = 'active'
        and revoked_at is null
    `;

    await transaction`
      update public.admin_sessions
      set revoked_at = coalesce(revoked_at, now())
      where person_id = ${target.person_id}::uuid
        and revoked_at is null
    `;

    return { invite, target };
  });

  const inviteUrl = `${siteBaseUrl()}/${result.invite.preferred_locale}/admin/login?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(result.invite.email)}`;
  const delivery = await sendTransactionalEmail({
    html: `<p>Your MattaNutra Admin passkeys have been reset.</p><p><a href="${inviteUrl}">Create a new admin passkey</a></p><p>This recovery link expires in ${recoveryInviteMinutes} minutes.</p>`,
    subject: "Recover your MattaNutra Admin passkey",
    to: result.invite.email
  });

  await recordAdminAudit({
    action: "admin.passkey_recovery_started",
    actorPersonId: null,
    organisationId: result.invite.organisation_id,
    resourceId: result.target.person_id,
    resourceType: "person",
    metadata: {
      invitationId: result.invite.id,
      reason: delivery.reason,
      sent: delivery.sent,
      source: "break_glass_cli"
    }
  });

  const output = {
    email: result.invite.email,
    expiresAt: new Date(result.invite.expires_at).toISOString(),
    inviteId: result.invite.id,
    inviteUrl,
    sent: delivery.sent
  };

  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`[passkey-recovery] invite=${output.inviteId}`);
    console.log(`[passkey-recovery] expiresAt=${output.expiresAt}`);
    console.log(`[passkey-recovery] sent=${output.sent}`);
    console.log(`[passkey-recovery] url=${output.inviteUrl}`);
  }
} finally {
  await closeSqlPool();
}
