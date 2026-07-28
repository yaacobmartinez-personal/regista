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
  | "CHECK_IN_REGISTRATION";

export async function recordAudit(entry: {
  tenantId: string;
  actorUserId: string;
  action: AuditAction;
  targetType?: string;
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
