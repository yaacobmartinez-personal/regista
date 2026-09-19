import { z } from "zod";
import { prisma } from "@/lib/db";
import { redeemVerification } from "@/lib/verification";
import { mintToken } from "@/lib/mobile-auth";
import { badRequest, readJson, route, validationFailed } from "@/lib/api-response";

/**
 * #2 — confirm an address, and sign in.
 *
 * The same token the web's verification link carries, so a person who opens the
 * email on their phone lands in the app rather than being bounced to a browser.
 * It redeems either kind: one from an organization signup activates that
 * organization as the web page would, one from a personal account only confirms
 * the address.
 *
 * Signing them in here is the point — they have just proved they own the
 * mailbox, and asking for the password they set two minutes ago would be
 * friction with nothing behind it.
 */

const bodySchema = z.object({
  token: z.string().trim().min(1, "This link is no longer valid."),
});

export const POST = route(async (request: Request) => {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  const redeemed = await redeemVerification(parsed.data.token);
  // Unknown, expired, or already spent all answer the same: the link does not
  // work, and which of the three it is helps nobody holding it.
  if (!redeemed) throw badRequest("This link is no longer valid.");

  const user = await prisma.user.findUnique({
    where: { id: redeemed.userId },
    select: { id: true, email: true, name: true, tokenVersion: true },
  });
  if (!user) throw badRequest("This link is no longer valid.");

  return Response.json({
    token: mintToken(user.id, user.tokenVersion),
    user: { id: user.id, email: user.email, name: user.name },
  });
});
