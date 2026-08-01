import { SignupForm } from "./signup-form";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { appOrigin, rootDomain } from "@/lib/urls";

export const metadata = {
  title: "Create your organization — Regista",
};

export default function SignupPage() {
  const domain = rootDomain();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Wordmark href="/" />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              href={`${appOrigin()}/login`}
              className="rounded-lg border border-line-strong px-3 py-2 text-sm font-medium transition-colors hover:bg-panel"
            >
              Sign in
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-5 py-14">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your organization
        </h1>
        <p className="mt-2 text-sm text-muted">
          Claim your address and start publishing events. We&apos;ll email you a
          link to confirm.
        </p>

        <SignupForm rootDomain={domain} />
      </main>
    </div>
  );
}
