import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { JoinRestaurantForm } from "@/components/auth/SimpleForms";
import { getContext } from "@/lib/session";
import { JOIN_CODE_RE } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const metadata = { title: "Join a restaurant" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  const { code } = await searchParams;
  const clean = code && JOIN_CODE_RE.test(code.toUpperCase()) ? code.toUpperCase() : undefined;
  return (
    <AuthShell
      title="Join a restaurant"
      subtitle="Enter the joining code. A manager will review your request."
      footer={<Link href={ctx.workspaces.length ? "/account" : "/onboarding"} className="font-semibold text-primary underline underline-offset-4">Back</Link>}
    >
      <JoinRestaurantForm code={clean} />
    </AuthShell>
  );
}
