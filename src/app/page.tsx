import Link from "next/link";
import { ArrowRight, ChartNoAxesCombined, UtensilsCrossed, Users } from "lucide-react";
import { HeroSlides } from "@/components/HeroSlides";
import { Logo } from "@/components/Logo";
import { LinkButton } from "@/components/ui/Button";
import { TAGLINE } from "@/lib/constants";

const BENEFITS = [
  { icon: UtensilsCrossed, title: "Easy Order Management", color: "text-action" },
  { icon: ChartNoAxesCombined, title: "Real-Time Reports", color: "text-sky-300" },
  { icon: Users, title: "Team Collaboration", color: "text-hot" },
];

export default function LandingPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-forest text-white">
      <HeroSlides />

      <header className="relative z-10 flex items-center gap-3 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:px-12 lg:pt-8">
        <Logo variant="mark" white priority className="h-14 w-14 shrink-0 lg:h-16 lg:w-16" />
        <div className="min-w-0 leading-tight">
          <Logo variant="wordmark" white className="h-6 w-auto lg:h-7" />
          <p className="mt-1 text-[13px] text-white/90 lg:text-sm">{TAGLINE}</p>
        </div>
      </header>

      <div className="relative z-10 mt-auto px-4 pb-14 pt-8 sm:px-8 lg:mt-0 lg:flex lg:flex-1 lg:items-center lg:px-12 lg:pb-16">
        {/* Semi-transparent card: the photo stays visible through it. */}
        <section
          aria-labelledby="hero-title"
          className="w-full rounded-3xl border border-white/20 bg-black/50 p-6 sm:p-8 lg:max-w-xl lg:p-10"
        >
          <h1 id="hero-title" className="font-display text-[2.5rem] font-bold leading-[1.08] sm:text-5xl">
            Run Your
            <br />
            Restaurant
            <br />
            <span className="text-hot">Smarter</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white sm:text-lg">
            Manage orders, track sales, control stock, and grow your business — all in one place.
          </p>

          <ul className="mt-6 grid grid-cols-3 gap-3">
            {BENEFITS.map(({ icon: Icon, title, color }) => (
              <li key={title} className="flex flex-col items-start gap-2">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
                  <Icon className={`h-6 w-6 ${color}`} aria-hidden />
                </span>
                <span className="text-[13px] font-medium leading-snug text-white sm:text-sm">{title}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 space-y-4">
            <LinkButton href="/signup" size="lg" block className="!bg-action !text-ink hover:!bg-white">
              Get Started <ArrowRight className="h-5 w-5" aria-hidden />
            </LinkButton>
            <p className="text-center text-sm text-white">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-hot underline-offset-4 hover:underline">
                Login
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
