"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { requestReset } from "./actions";
import type { ForgotState } from "./shared";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<ForgotState | undefined, FormData>(
    requestReset,
    undefined,
  );

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
          <span className="font-semibold tracking-tight">Thingstead</span>
        </div>

        {state?.sent ? (
          <>
            <h1 className="mt-6 text-xl font-semibold tracking-tight">Check your email</h1>
            {/* Deliberately says "if": confirming that the address has an account
                would turn this form into a way to test addresses. */}
            <p className="mt-2 text-sm text-muted">
              If that address has a Thingstead account, a link to choose a new password is on
              its way. It works once and expires in an hour.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex rounded-lg border border-line-strong px-4 py-2.5 text-sm font-medium transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-xl font-semibold tracking-tight">
              Forgot your password?
            </h1>
            <p className="mt-1 text-sm text-muted">
              Enter your email and we&apos;ll send you a link to choose a new one.
            </p>

            <form action={formAction} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Email</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="rounded-lg border border-line-strong bg-canvas px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
                {state?.fieldErrors?.email ? (
                  <span className="text-xs text-danger">{state.fieldErrors.email}</span>
                ) : null}
              </label>

              {state?.error ? (
                <p className="text-sm text-danger" role="alert">
                  {state.error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={pending}
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {pending ? "Sending…" : "Send the link"}
              </button>

              <Link href="/login" className="text-center text-xs text-muted hover:text-fg">
                Back to sign in
              </Link>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
