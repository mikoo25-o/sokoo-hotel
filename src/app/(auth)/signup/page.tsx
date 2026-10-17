import { redirect } from "next/navigation";
import { AuthShell, SetupNotice } from "@/components/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";
import { isSupabaseConfigured } from "@/lib/env";
import { getContext, homeFor } from "@/lib/session";
import { JOIN_CODE_RE } from "@/lib/validation";

export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const configured = isSupabaseConfigured();
  if (configured) {
    const ctx = await getContext();
    if (ctx) redirect(homeFor(ctx));
  }
  const code = sp.code && JOIN_CODE_RE.test(sp.code.toUpperCase()) ? sp.code.toUpperCase() : undefined;
  const path = sp.path === "join" || code ? "join" : "create";
  return (
    <AuthShell title="Create your account" subtitle="Set up a new restaurant, or join your team with a code." wide>
      {!configured ? <SetupNotice /> : null}
      <SignupForm initialPath={path} code={code} disabled={!configured} />
    </AuthShell>
  );
}
