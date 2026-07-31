"use client";

import { useActionState } from "react";
import { inviteMember } from "./actions";
import type { InviteState } from "./shared";

const field =
  "rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm placeholder:text-faint focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25";

export function InviteForm({ tenantSlug }: { tenantSlug: string }) {
  const [state, formAction, pending] = useActionState<InviteState | undefined, FormData>(
    inviteMember,
    undefined,
  );

  return (
    <form action={formAction} className="mt-5 flex flex-col gap-3">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />

      <div className="flex flex-wrap items-start gap-2">
        <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-sm">
          <span className="sr-only">Email address</span>
          <input
            name="email"
            type="email"
            required
            placeholder="colleague@company.com"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="sr-only">Role</span>
          <select name="role" defaultValue="STAFF" className={field}>
            <option value="STAFF">Staff</option>
            <option value="ADMIN">Admin</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {pending ? "Sending…" : "Send invitation"}
        </button>
      </div>

      {state?.fieldErrors?.email ? (
        <p className="text-xs text-red-600 dark:text-red-400">
          {state.fieldErrors.email}
        </p>
      ) : null}
      {state?.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {state?.alreadyMember ? (
        <p role="status" className="text-xs text-muted">
          {state.invitedEmail} is already on your team.
        </p>
      ) : state?.invitedEmail ? (
        <p role="status" className="text-xs text-success">
          Invitation sent to {state.invitedEmail}.
        </p>
      ) : null}
    </form>
  );
}
