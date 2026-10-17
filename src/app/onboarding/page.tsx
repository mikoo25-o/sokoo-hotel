import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, KeyRound, Store } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { signOut } from "@/app/actions/auth";
import { getContext, homeFor } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Get started" };

export default async function OnboardingPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.workspaces.length) redirect(homeFor(ctx));
  const first = ctx.profile.full_name.split(" ")[0];
  return (
    <AuthShell
      title={first ? `Welcome, ${first}` : "Welcome"}
      subtitle="Your email is verified. How would you like to use SokoHotel?"
      footer={
        <form action={signOut}>
          <button className="font-semibold text-primary underline underline-offset-4">Log out</button>
        </form>
      }
    >
      <div className="space-y-3">
        {[
          { href: "/onboarding/create", icon: Store, title: "Create a new restaurant", text: "Set up your restaurant, menu and tables. You become the owner." },
          { href: "/onboarding/join", icon: KeyRound, title: "Join an existing restaurant", text: "Enter the joining code from your manager and wait for approval." },
        ].map(({ href, icon: Icon, title, text }) => (
          <Link key={href} href={href} className="flex items-center gap-4 rounded-xl border border-line p-4 transition-colors hover:border-primary hover:bg-primary/5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{title}</span>
              <span className="block text-sm text-muted">{text}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          </Link>
        ))}
      </div>
    </AuthShell>
  );
}
