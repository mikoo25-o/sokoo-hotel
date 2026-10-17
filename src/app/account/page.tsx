import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ProfileForm } from "@/components/auth/SimpleForms";
import { InstallApp } from "@/components/InstallApp";
import { Card, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { signOut } from "@/app/actions/auth";
import { getContext, homeFor } from "@/lib/session";
import { StatusBanner } from "@/components/StatusBanner";
import { ROLE_LABEL } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (!ctx.current) redirect(homeFor(ctx));
  return (
    <AppShell ctx={ctx} workspace={ctx.current} banner={<StatusBanner restaurantId={ctx.current.restaurant.id} tz={ctx.current.restaurant.timezone} canPay={["owner", "manager"].includes(ctx.current.membership.role)} />}>
      <PageHeader title="Account" subtitle={`${ROLE_LABEL[ctx.current.membership.role]} at ${ctx.current.restaurant.name}`} />
      <div className="space-y-5">
        <Card className="p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">Your details</h2>
          <p className="mb-4 text-sm text-muted">Signed in as {ctx.user.email}</p>
          <ProfileForm name={ctx.profile.full_name} phone={ctx.profile.phone ?? ""} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-display text-lg font-semibold">Use SokoHotel like an app</h2>
          <InstallApp />
        </Card>
        <Card className="space-y-3 p-5">
          <h2 className="font-display text-lg font-semibold">Restaurants</h2>
          <p className="text-sm text-muted">
            {ctx.workspaces.length > 1 ? "Switch to another restaurant you belong to." : "Have a code for another restaurant? You can request to join it too."}
          </p>
          <div className="flex flex-wrap gap-3">
            {ctx.workspaces.length > 1 ? (
              <Link href="/workspace" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-semibold text-ink hover:bg-canvas">
                Switch restaurant
              </Link>
            ) : null}
            <Link href="/onboarding/join" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 font-semibold text-ink hover:bg-canvas">
              Join another restaurant
            </Link>
          </div>
        </Card>
        <form action={signOut}>
          <Button type="submit" variant="secondary" block>
            Log out
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
