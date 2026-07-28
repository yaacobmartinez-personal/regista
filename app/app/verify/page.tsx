import Link from "next/link";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/tokens";
import { Logo, Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = {
  title: "Verify your email — Regista",
};

type Outcome =
  | { kind: "verified"; organization: string; slug: string }
  | { kind: "already"; organization: string; slug: string }
  | { kind: "invalid" };

/**
 * Redeem a signup verification link.
 *
 * The emailed value is hashed before lookup (only the hash is stored), and
 * redemption is single-use: `usedAt` is set in the same transaction that
 * activates the tenant.
 */
async function redeem(rawToken: string | undefined): Promise<Outcome> {
  if (!rawToken) return { kind: "invalid" };

  const record = await prisma.verificationToken.findUnique({
    where: { token: hashToken(rawToken) },
  });
  if (!record || !record.tenantId) return { kind: "invalid" };

  const tenant = await prisma.tenant.findUnique({ where: { id: record.tenantId } });
  if (!tenant) return { kind: "invalid" };

  // Already redeemed: if the tenant is live, say so plainly rather than erroring.
  if (record.usedAt) {
    return tenant.status === "ACTIVE"
      ? { kind: "already", organization: tenant.name, slug: tenant.slug }
      : { kind: "invalid" };
  }

  if (record.expiresAt.getTime() <= Date.now()) return { kind: "invalid" };

  await prisma.$transaction([
    prisma.verificationToken.update({
      where: { token: record.token },
      data: { usedAt: new Date() },
    }),
    prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: "ACTIVE" },
    }),
    prisma.user.updateMany({
      where: { email: record.identifier, emailVerified: null },
      data: { emailVerified: new Date() },
    }),
  ]);

  return { kind: "verified", organization: tenant.name, slug: tenant.slug };
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const outcome = await redeem(token);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Wordmark />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-20">
        {outcome.kind === "invalid" ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              This link is no longer valid
            </h1>
            <p className="mt-2 text-sm text-muted">
              Verification links expire after 24 hours and can only be used once.
              Request a new one and we&apos;ll send a fresh link.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded-lg border border-line-strong px-4 py-2.5 text-sm font-medium transition-colors hover:bg-panel"
              >
                Go to sign in
              </Link>
            </div>
          </>
        ) : (
          <>
            <span
              aria-hidden
              className="grid h-11 w-11 place-items-center rounded-xl border border-success/30 bg-success-bg"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-success"
              >
                <path d="m20 6-11 11-5-5" />
              </svg>
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">
              {outcome.kind === "verified"
                ? `${outcome.organization} is live`
                : `${outcome.organization} is already verified`}
            </h1>
            <p className="mt-2 text-sm text-muted">
              Your address{" "}
              <span className="font-mono text-fg">
                {outcome.slug}.{process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000"}
              </span>{" "}
              is active. Sign in to publish your first event.
            </p>
            <div className="mt-8">
              <Link
                href="/login"
                className="inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
              >
                Sign in to your dashboard
              </Link>
            </div>
            <p className="mt-10 flex items-center gap-1.5 text-xs text-faint">
              <Logo className="!h-4 !w-4 !text-[10px]" />
              <span>Powered by Regista</span>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
