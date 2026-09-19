import { z } from "zod";
import { Role } from "@prisma/client";
import { requireApiMembership } from "@/lib/api-auth";
import { changeMemberRole, removeTeamMember, teamFor } from "@/lib/team";
import { conflict, notFound, readJson, route, validationFailed } from "@/lib/api-response";

/**
 * #31/#32 — change somebody's role, or take them off the team.
 *
 * Both refuse the change that would leave the organization with no admin, and
 * say so with `reason: "last_admin"` rather than a bare failure: the app has to
 * explain why, and "promote someone else first" is the only way out. The guard
 * counts inside the same transaction as the write, so two admins leaving at the
 * same moment cannot both pass it.
 *
 * Removing your own membership is how you leave — no special case, and the
 * guard applies to you exactly as it would to anyone else.
 */

const patchSchema = z.object({ role: z.enum(Role) });

const LAST_ADMIN =
  "That would leave the organization with no admin. Make someone else an admin first.";

export const PATCH = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; membershipId: string }> },
) => {
  const { slug, membershipId } = await ctx.params;
  const { tenant, userId } = await requireApiMembership(request, slug, "ADMIN");

  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  const outcome = await changeMemberRole(
    { tenantId: tenant.id, tenantName: tenant.name, userId },
    membershipId,
    parsed.data.role,
  );
  if (outcome === "gone") throw notFound("That person is no longer on the team.");
  if (outcome === "last_admin") throw conflict(LAST_ADMIN, { reason: "last_admin" });

  const team = await teamFor(tenant.id, userId);
  const member = team.members.find((m) => m.id === membershipId);
  if (!member) throw notFound("That person is no longer on the team.");

  return Response.json({ member });
});

export const DELETE = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string; membershipId: string }> },
) => {
  const { slug, membershipId } = await ctx.params;
  const { tenant, userId } = await requireApiMembership(request, slug, "ADMIN");

  const outcome = await removeTeamMember(
    { tenantId: tenant.id, tenantName: tenant.name, userId },
    membershipId,
  );
  if (outcome === "gone") throw notFound("That person is no longer on the team.");
  if (outcome === "last_admin") throw conflict(LAST_ADMIN, { reason: "last_admin" });

  return Response.json({ ok: true });
});
