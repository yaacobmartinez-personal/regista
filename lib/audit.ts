import { prisma } from "@/lib/db";

/**
 * Accountability trail for access to registrant personal data.
 *
 * Exports and erasures are recorded so an organization can answer "who saw or
 * removed this attendee's details, and when". Deliberately records identifiers
 * only — never the personal data itself.
 */
export type AuditAction =
  | "EXPORT_ATTENDEES"
  | "ERASE_REGISTRATION"
  | "CHECK_IN_REGISTRATION"
  // Released by the registrant themselves, from the link in their confirmation.
  // Recorded with no actor: there is no account behind it, and naming the
  // registration is enough to answer "why did this place come free".
  | "CANCEL_REGISTRATION"
  | "PROMOTE_REGISTRATION"
  | "INVITE_MEMBER"
  | "REVOKE_INVITATION"
  | "REMOVE_MEMBER"
  | "CHANGE_ROLE"
  // Deleting an event cascades to every registration under it, so it destroys
  // more personal data than any other action in the product.
  | "DELETE_EVENT";

export async function recordAudit(entry: {
  tenantId: string;
  /** Null for actions a registrant takes on themselves — there is no account. */
  actorUserId: string | null;
  action: AuditAction;
  targetType?: string;
  /** Identifier only — never the personal data itself. */
  targetId?: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
    },
  });
}
