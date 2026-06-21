import type { AdminSessionContext } from "@/lib/admin-access";
import { hasAdminPermission } from "@/lib/admin-rbac";

export function canWriteRetailStock(context: AdminSessionContext) {
  return hasAdminPermission(context, "stock.write") && !context.isLegacy;
}

export function canRouteRegionalCheckout(context: AdminSessionContext) {
  return canWriteRetailStock(context) && context.actorOrganisation.type === "platform";
}

export function canReadAllRetailStock(context: AdminSessionContext) {
  return context.effectiveOrganisation.type === "platform";
}

export function canAccessRetailOrganisation(
  context: AdminSessionContext,
  organisationId: string
) {
  return canReadAllRetailStock(context) ||
    organisationId === context.effectiveOrganisation.id;
}

export function persistedActorPersonId(context: AdminSessionContext) {
  return context.actorPerson.id.startsWith("00000000-0000-4000-8000-")
    ? null
    : context.actorPerson.id;
}

export function retailActorMetadata(context: AdminSessionContext) {
  return {
    actorDisplayName: context.actorPerson.displayName,
    actorEmail: context.actorPerson.email,
    actorKind: context.sessionId?.startsWith("task:") ? "agent" : "human",
    actorPersonId: context.actorPerson.id,
    persistedActorPersonId: persistedActorPersonId(context)
  };
}

export function canOverrideRetailTaskClaim(context: AdminSessionContext) {
  return (
    context.actorOrganisation.type === "platform" &&
    (context.actorMembership.role === "platform_owner" ||
      context.actorMembership.role === "platform_admin")
  );
}
