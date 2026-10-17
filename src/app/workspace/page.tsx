import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/Button";
import { selectWorkspace, signOut } from "@/app/actions/auth";
import { getContext } from "@/lib/session";
import { LOGIN_ROLES, ROLE_LABEL, matchesLoginRole, type LoginRole } from "@/lib/constants";

export const dynamic = "force-dynamic";

export const metadata = { title: "Choose restaurant" };

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (!ctx.workspaces.length) redirect("/onboarding");
  const { role } = await searchParams;
  const wanted = LOGIN_ROLES.find((r) => r.value === role)?.value as LoginRole | undefined;
  const list = wanted ? ctx.workspaces.filter((w) => matchesLoginRole(w.membership.role, wanted)) : ctx.workspaces;
  return (
    <AuthShell
      title="Choose a restaurant"
      subtitle="You belong to more than one restaurant. Pick where you are working now."
      footer={
        <form action={signOut}>
          <button className="font-semibold text-primary underline underline-offset-4">Log out</button>
        </form>
      }
    >
      <ul className="space-y-3">
        {list.map((w) => (
          <li key={w.restaurant.id}>
            <form action={selectWorkspace}>
              <input type="hidden" name="restaurant_id" value={w.restaurant.id} />
              {wanted ? <input type="hidden" name="role" value={wanted} /> : null}
              <Button type="submit" variant="secondary" block className="!h-auto !justify-start gap-3 !py-3.5 text-left">
                <Building2 className="h-6 w-6 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{w.restaurant.name}</span>
                  <span className="block text-sm font-normal text-muted">{ROLE_LABEL[w.membership.role]}</span>
                </span>
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </AuthShell>
  );
}
