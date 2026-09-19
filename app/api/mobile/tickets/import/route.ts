import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireApiUser } from "@/lib/api-auth";
import { inspectRegistration, ticketById } from "@/lib/registrations";
import { ApiError, notFound, readJson, route, validationFailed } from "@/lib/api-response";

/**
 * #16 — attach a place booked before the app to this account.
 *
 * The token is the one in the confirmation email, which until now was the only
 * way to reach that registration. Importing does not move the place or change
 * it; it records which account it belongs to, so it shows up in the list and can
 * be managed without digging out the email again.
 *
 * The registration's address must equal the account's. That link is emailed to
 * one person and forwarding it is easy, so without this check anyone passed a
 * confirmation could attach a stranger's place to their own account and see
 * their name, their status, and their ticket. Matching addresses is what makes
 * "this is mine" true rather than merely claimed — the account's own address is
 * verified, so it cannot be set to someone else's to get around it.
 */

const bodySchema = z.object({
  token: z.string().trim().min(1, "Paste the link from your confirmation email."),
});

export const POST = route(async (request: Request) => {
  const user = await requireApiUser(request);

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  // Read-only: resolving a token must not spend or change anything.
  const registration = await inspectRegistration(parsed.data.token);
  if (!registration) throw notFound("That link doesn't open a registration.");

  if (registration.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new ApiError(
      403,
      "That registration belongs to a different email address.",
      { reason: "email_mismatch" },
    );
  }

  // Idempotent: importing a place already attached to this account is a no-op
  // that still answers with the ticket.
  await prisma.registration.updateMany({
    where: { id: registration.id, OR: [{ userId: null }, { userId: user.id }] },
    data: { userId: user.id },
  });

  const ticket = await ticketById(registration.id);
  if (!ticket) throw notFound("That link doesn't open a registration.");

  return Response.json({ ticket });
});
