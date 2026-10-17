import { redirect } from "next/navigation";
import { OrderBuilder } from "@/components/waiter/OrderBuilder";
import { createClient } from "@/lib/supabase/server";
import { loadMenu } from "@/lib/menu-data";
import { requireRole, WAITER_ACCESS } from "@/lib/session";
import { uuidSchema } from "@/lib/validation";
import type { ServiceLocation } from "@/lib/types";
import { n } from "@/lib/types";

export const metadata = { title: "New order" };

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  await requireRole(WAITER_ACCESS);
  const { table } = await searchParams;
  const id = uuidSchema.safeParse(table);
  if (!id.success) redirect("/waiter/tables");
  const supabase = await createClient();
  const { data: loc } = await supabase
    .from("service_locations")
    .select("id, name, area, kind, is_active")
    .eq("id", id.data)
    .eq("is_active", true)
    .maybeSingle();
  if (!loc) redirect("/waiter/tables");
  const location = loc as ServiceLocation;
  const { categories, items } = await loadMenu(supabase);

  return (
    <OrderBuilder
      locationId={location.id}
      locationName={location.name}
      locationArea={location.area}
      isTakeaway={location.kind === "takeaway"}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      items={items.map((i) => ({
        id: i.id,
        category_id: i.category_id,
        name: i.name,
        description: i.description,
        price_minor: n(i.price_minor),
        image_url: i.image_url,
        is_available: i.is_available,
        fulfilment: i.fulfilment,
      }))}
    />
  );
}
