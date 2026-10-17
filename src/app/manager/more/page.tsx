import { MoreLinks } from "@/components/AppNav";
import { PageHeader } from "@/components/ui/Card";
import { navFor } from "@/lib/nav";
import { MANAGERS, requireRole } from "@/lib/session";

export const metadata = { title: "More" };

export default async function MorePage() {
  const ctx = await requireRole(MANAGERS);
  return (
    <>
      <PageHeader title="More" subtitle={ctx.current.restaurant.name} />
      <MoreLinks items={navFor(ctx.current.membership.role)} />
    </>
  );
}
