import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { CreateRestaurantForm } from "@/components/auth/SimpleForms";
import { getContext, homeFor } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Create your restaurant" };

export default async function CreatePage() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.workspaces.length) redirect(homeFor(ctx));
  return (
    <AuthShell
      title="Create your restaurant"
      subtitle="Just the basics for now. Next you will add your menu, prices and tables."
      footer={<Link href="/onboarding" className="font-semibold text-primary underline underline-offset-4">Back</Link>}
    >
      <CreateRestaurantForm />
    </AuthShell>
  );
}
