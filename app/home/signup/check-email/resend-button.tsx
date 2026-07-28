"use client";

import { useState, useTransition } from "react";
import { resendVerification } from "../actions";

export function ResendButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  function onClick() {
    startTransition(async () => {
      const result = await resendVerification();
      setIsError(!result.sent);
      setMessage(
        result.sent ? "Sent. Give it a minute to arrive." : (result.error ?? "Try again shortly."),
      );
    });
  }

  return (
    <span className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-lg border border-line-strong px-4 py-2.5 text-sm font-medium transition-colors hover:bg-panel disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        {pending ? "Sending…" : "Resend email"}
      </button>
      {message ? (
        <span
          role="status"
          className={`text-xs ${isError ? "text-red-600 dark:text-red-400" : "text-success"}`}
        >
          {message}
        </span>
      ) : null}
    </span>
  );
}
