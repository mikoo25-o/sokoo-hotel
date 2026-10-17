import { AppShell } from "@/components/AppShell";
import { StatusBanner } from "@/components/StatusBanner";
import { requireRole } from "@/lib/session";
import type { AppRole } from "@/lib/constants";

/** Wraps a role's pages in the app shell after checking the role in the active restaurant. */
export async function RoleLayout({ roles, wide, children }: { roles: AppRole[]; wide?: boolean; children: React.ReactNode }) {
  const ctx = await requireRole(roles);
  const r = ctx.current.restaurant;
  const canPay = ["owner", "manager"].includes(ctx.current.membership.role);
  return (
    <AppShell ctx={ctx} workspace={ctx.current} banner={<StatusBanner restaurantId={r.id} tz={r.timezone} canPay={canPay} />} wide={wide}>
      {children}
    </AppShell>
  );
}
