import { PageHeader } from "@/components/ui/Card";
import { StarterData } from "@/components/manager/StarterData";
import { MenuManager } from "@/components/manager/MenuManager";
import { createClient } from "@/lib/supabase/server";
import { loadMenu } from "@/lib/menu-data";
import { MANAGERS, requireRole } from "@/lib/session";

export const metadata = { title: "Menu" };

export default async function MenuPage() {
  const ctx = await requireRole(MANAGERS);
  const supabase = await createClient();
  const { categories, items } = await loadMenu(supabase, { includeInactive: true });
  return (
    <>
      <PageHeader title="Menu" subtitle="What your waiters can order, and at what price." />
      {items.length === 0 ? <StarterData /> : null}
      <MenuManager restaurantId={ctx.current.restaurant.id} categories={categories} items={items} />
    </>
  );
}
