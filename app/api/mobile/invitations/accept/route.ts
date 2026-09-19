import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { findLiveInvitation, redeemInvitation } from "@/lib/invitations";
import { ApiError, badRequest, readJson, route, validationFailed } from "@/lib/api-response";

/**
 * #33 — join a team from an invitation link, in the app.
 *
 * The address on the invitation must be the account's. An invitation is emailed
 * to one person and forwarding it is easy; without this check anyone passed the
 * link could put themselves inside an organization they were never invited to.
 * The account's own address is verified, so it cannot be changed to get around
 * this.
 *
 * `redeemInvitation` never changes an existing membership — an outstanding
 * invitation is a stale snapshot, and letting it rewrite a role would mean an
 * old STAFF link could quietly demote a sitting admin.
 */

const bodySchema = z.object({
  token: z.string().trim().min(1, "That invitation link is no longer valid."),
});

export const POST = route(async (request: Request) => {
  const user = await requireApiUser(request);

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  const invitation = await findLiveInvitation(parsed.data.token);
  // Unknown, expired, already accepted, or for a suspended organization all
  // answer the same: the link does not work, and which it is helps nobody.
  if (!invitation) throw badRequest("That invitation link is no longer valid.");

  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new ApiError(403, "That invitation was sent to a different email address.", {
      reason: "email_mismatch",
    });
  }

  await redeemInvitation(invitation, user.id);

  return Response.json({
    org: {
      slug: invitation.tenantSlug,
      name: invitation.tenantName,
      role: invitation.role,
    },
  });
});
