import Image from "next/image";
import Link from "next/link";
import { CheckCircle2, Lock, TriangleAlert } from "lucide-react";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { LoginForm } from "@/components/auth/LoginForm";
import { SetupNotice } from "@/components/AuthShell";
import { isSupabaseConfigured } from "@/lib/env";
import { getContext, homeFor } from "@/lib/session";
import { safeNext } from "@/lib/validation";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const configured = isSupabaseConfigured();
  if (configured) {
    const ctx = await getContext();
    if (ctx) redirect(homeFor(ctx));
  }
  const next = safeNext(sp.next) ?? undefined;

  return (
    <main className="min-h-dvh bg-white lg:grid lg:grid-cols-2">
      <div className="relative h-52 sm:h-64 lg:h-auto">
        <Image src="/landing/login-header.jpg" alt="" fill priority sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover object-[50%_35%]" />
        <div className="absolute inset-0 bg-black/35" aria-hidden />
        <Link href="/" className="absolute left-5 top-[max(1.25rem,env(safe-area-inset-top))] flex items-center gap-3 text-white">
          <Logo variant="mark" white className="h-12 w-12" />
          <span className="leading-tight">
            <Logo variant="wordmark" white className="h-5 w-auto" />
            <span className="mt-1 block text-xs text-white/90">Smarter Restaurant Operations</span>
          </span>
        </Link>
      </div>

      <div className="relative -mt-6 rounded-t-3xl bg-white px-5 pb-10 pt-8 sm:px-10 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:rounded-none lg:px-14">
        <div className="mx-auto w-full max-w-md">
          <h1 className="font-display text-3xl font-semibold text-forest">Welcome back</h1>
          <p className="mt-1 text-lg text-muted">Log in to your restaurant</p>

          <div className="mt-6 space-y-4">
            {!configured ? <SetupNotice /> : null}
            {sp.reset ? (
              <p role="status" className="flex items-start gap-2 rounded-xl border border-ok/30 bg-ok/10 px-3.5 py-3 text-sm text-ok">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Password updated. Sign in with your new password.
              </p>
            ) : null}
            {sp.error === "link" ? (
              <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3 text-sm text-danger">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> That link has expired or was already used. Sign in, or request a new link.
              </p>
            ) : null}
          </div>

          <div className="mt-6">
            <LoginForm next={next} disabled={!configured} />
          </div>

          <p className="mt-7 text-center text-[15px] text-muted">
            New to SokoHotel?{" "}
            <Link href="/signup" className="font-semibold text-primary underline underline-offset-4">
              Create an account
            </Link>
          </p>
          <p className="mt-5 flex items-center justify-center gap-2 text-[13px] text-muted">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Your account is secure and private
          </p>
        </div>
      </div>
    </main>
  );
}
