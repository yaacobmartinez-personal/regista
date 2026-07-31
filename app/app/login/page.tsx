"use client";

import { useActionState, useEffect } from "react";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { authenticate } from "./actions";
import type { LoginState } from "./shared";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState | undefined, FormData>(
    authenticate,
    undefined,
  );
  const error = state?.error;
  const redirectTo = state?.redirectTo;

  // A full navigation, so the request passes through the subdomain rewrite.
  useEffect(() => {
    if (redirectTo) window.location.assign(redirectTo);
  }, [redirectTo]);

  return (
    <main className="relative grid min-h-screen place-items-center bg-canvas px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(120%_100%_at_50%_-10%,color-mix(in_srgb,var(--color-accent)_9%,transparent),transparent_60%)]"
      />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-sm">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-semibold tracking-tight">Regista</span>
        </div>
        <h1 className="mt-6 text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted">
          Manage your organization&apos;s events.
        </p>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
              className="rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
              className="rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
            />
          </label>

          {error ? (
            <p id="login-error" role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending || Boolean(redirectTo)}
            className="mt-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {pending || redirectTo ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
