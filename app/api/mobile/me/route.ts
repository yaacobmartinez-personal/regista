import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/api-auth";
import { readJson, route, validationFailed } from "@/lib/api-response";

/**
 * #8/#9 — the signed-in account, and its organizations.
 *
 * One call for what the app needs at boot: who it is signed in as, whether the
 * address is confirmed, and which organizations it can organize for (none, for
 * an attendee-only account). It replaces probing `GET /mobile/orgs` to find out
 * whether the token still works.
 */

async function orgsFor(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId, tenant: { status: "ACTIVE" } },
    include: { tenant: { select: { slug: true, name: true, plan: true } } },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => ({
    slug: m.tenant.slug,
    name: m.tenant.name,
    role: m.role,
    plan: m.tenant.plan,
  }));
}

export const GET = route(async (request: Request) => {
  const user = await requireApiUser(request);
  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
    },
    orgs: await orgsFor(user.id),
  });
});

const patchSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name.").max(120),
});

/** #9 — change the name shown on tickets and to organizers. */
export const PATCH = route(async (request: Request) => {
  const user = await requireApiUser(request);

  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name },
    select: { id: true, email: true, name: true, emailVerified: true },
  });

  return Response.json({
    user: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      emailVerified: updated.emailVerified !== null,
    },
  });
});
