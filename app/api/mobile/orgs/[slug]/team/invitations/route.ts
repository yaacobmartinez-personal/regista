import { z } from "zod";
import { Role } from "@prisma/client";
import { requireApiMembership } from "@/lib/api-auth";
import { inviteToTeam } from "@/lib/team";
import { rateLimit } from "@/lib/rate-limit";
import { ApiError, readJson, route, tooManyRequests, validationFailed } from "@/lib/api-response";

/**
 * #29 — invite somebody to the team.
 *
 * Three answers, because they mean different things to whoever is asking:
 * 201 with the invitation, 200 saying they are already on the team, and 502
 * when the row was written but the mail did not go — the admin needs to know
 * the invitation exists and is listed, and that nobody has been told about it.
 */

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  // Taken from the schema rather than restated, so adding a role is a compile
  // error at the places that need updating instead of a silent rejection here.
  role: z.enum(Role),
});

export const POST = route(async (
  request: Request,
  ctx: { params: Promise<{ slug: string }> },
) => {
  const { slug } = await ctx.params;
  const { tenant, userId } = await requireApiMembership(request, slug, "ADMIN");

  // Invitations are outbound mail from a verified sending domain, so an
  // unbounded invite button is a phishing amplifier. The same buckets the
  // dashboard uses, so the app does not come with a second allowance.
  const perTenant = rateLimit(`invite:tenant:${tenant.id}`, 50, 24 * 60 * 60);
  const perActor = rateLimit(`invite:actor:${userId}`, 20, 60 * 60);
  if (!perTenant.ok || !perActor.ok) {
    throw tooManyRequests("You've sent a lot of invitations recently. Try again later.");
  }

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  const result = await inviteToTeam(
    { tenantId: tenant.id, tenantName: tenant.name, userId },
    parsed.data,
  );

  if (result.outcome === "already_member") {
    return Response.json({ alreadyMember: true });
  }
  if (result.outcome === "email_failed") {
    throw new ApiError(
      502,
      "The invitation was created but we couldn't send the email. Revoke it and try again.",
      { invitation: result.invitation },
    );
  }

  return Response.json({ invitation: result.invitation }, { status: 201 });
});
