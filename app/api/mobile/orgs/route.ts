import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/api-auth";
import { createTenantForUser } from "@/lib/tenant";
import { badRequest, conflict, readJson, route, validationFailed } from "@/lib/api-response";

/**
 * E2 — the organizations the signed-in person belongs to.
 *
 * PENDING tenants are left out: an organization that has not confirmed its
 * address cannot be used yet, and the app has nowhere to send someone who picks
 * one. The web makes the same choice in its organization chooser, which is why
 * it explains the omission there rather than listing them.
 */
export const GET = route(async (request: Request) => {
  const user = await requireApiUser(request);

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, tenant: { status: "ACTIVE" } },
    include: { tenant: { select: { slug: true, name: true, plan: true } } },
    orderBy: { createdAt: "asc" },
  });

  return Response.json({
    orgs: memberships.map((membership) => ({
      slug: membership.tenant.slug,
      name: membership.tenant.name,
      role: membership.role,
      plan: membership.tenant.plan,
    })),
  });
});

/**
 * #35 — create an organization for the signed-in account.
 *
 * Active at once, with no email: web signup leaves an organization PENDING
 * until its owner proves they own the address, but this caller proved that
 * already — being signed in is what that means. Sending another confirmation
 * would be asking twice.
 */

const createSchema = z.object({
  name: z.string().trim().min(2, "Give your organization a name.").max(60),
  slug: z.string().trim().toLowerCase().min(1, "Choose an address."),
});

export const POST = route(async (request: Request) => {
  const user = await requireApiUser(request);

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  const result = await createTenantForUser(user.id, parsed.data);

  // The same wording the web signup uses, so the two forms read alike.
  if (result.outcome === "reserved_slug") {
    throw badRequest("Check the form and try again.", {
      fieldErrors: { slug: "That address isn't available." },
    });
  }
  if (result.outcome === "invalid_slug") {
    throw badRequest("Check the form and try again.", {
      fieldErrors: {
        slug: "Use 3–63 letters, numbers, or hyphens (start and end with a letter or number).",
      },
    });
  }
  if (result.outcome === "taken") {
    // A conflict rather than a plain rejection: the address was free when they
    // checked and somebody else claimed it in between.
    throw conflict("That address is already taken.", {
      fieldErrors: { slug: "That address is already taken." },
    });
  }

  return Response.json(
    { org: { ...result.tenant, role: "ADMIN" } },
    { status: 201 },
  );
});
