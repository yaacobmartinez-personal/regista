import { Logo } from "@/components/brand";
import { ScrollProgress } from "@/components/motion/primitives";
import { MarketingNav } from "@/components/marketing/nav";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Features, Trust, CallToAction } from "@/components/marketing/sections";

export default function MarketingHome() {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";
  const proto = rootDomain.startsWith("localhost") ? "http" : "https";
  const loginUrl = `${proto}://app.${rootDomain}/login`;
  const signupUrl = `${proto}://${rootDomain}/signup`;

  return (
    <div className="flex min-h-screen flex-col">
      <ScrollProgress />
      <MarketingNav loginUrl={loginUrl} signupUrl={signupUrl} />

      <main className="flex-1">
        <Hero signupUrl={signupUrl} />
        <HowItWorks />
        <Features />
        <Trust />
        <CallToAction signupUrl={signupUrl} />
      </main>

      <footer>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Logo className="!h-5 !w-5 !text-[11px]" />
            <span>Regista</span>
          </div>
          <p className="font-mono text-xs text-faint">
            Event registration for every organization
          </p>
          <a
            href={loginUrl}
            className="text-sm text-muted transition-colors hover:text-fg"
          >
            Organizer sign in →
          </a>
        </div>
      </footer>
    </div>
  );
}
