import { z } from "zod";
import { redeemPasswordReset } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { mintToken } from "@/lib/mobile-auth";
import { badRequest, readJson, route, validationFailed } from "@/lib/api-response";

/**
 * #5 — set a new password from a reset link, and sign in.
 *
 * The new token is minted from the `tokenVersion` the reset just raised, so the
 * session this hands back is the only live one: every other device is signed
 * out by the same change. That is the behaviour someone resetting a password
 * expects, and the reason they are usually doing it.
 */

const bodySchema = z.object({
  token: z.string().trim().min(1, "This link is no longer valid."),
  password: z.string().min(8, "Use at least 8 characters."),
});

export const POST = route(async (request: Request) => {
  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) throw validationFailed(parsed.error);

  const reset = await redeemPasswordReset(parsed.data.token, parsed.data.password);
  if (!reset) throw badRequest("This link is no longer valid.");

  const user = await prisma.user.findUnique({
    where: { id: reset.userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) throw badRequest("This link is no longer valid.");

  return Response.json({
    token: mintToken(reset.userId, reset.tokenVersion),
    user: { id: user.id, email: user.email, name: user.name },
  });
});
