import { Card, PageHeader, SectionTitle } from "@/components/ui/Card";
import { AddTablesForm, LocationList, RestaurantForm, TakeawayToggle } from "@/components/manager/SettingsForms";
import { createClient } from "@/lib/supabase/server";
import { MANAGERS, requireRole } from "@/lib/session";
import type { ServiceLocation } from "@/lib/types";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireRole(MANAGERS);
  const r = ctx.current.restaurant;
  const supabase = await createClient();
  const { data } = await supabase.from("service_locations").select("id, name, area, kind, seats, is_active, sort_order").order("area").order("sort_order").order("name");
  const locations = (data ?? []) as ServiceLocation[];
  return (
    <>
      <PageHeader title="Settings" subtitle="Your restaurant details, receipts and tables." />
      <Card className="p-5"><RestaurantForm r={r} /></Card>

      <div id="tables" className="scroll-mt-20" />
      <SectionTitle>Tables and service areas</SectionTitle>
      <Card className="space-y-6 p-5">
        <TakeawayToggle enabled={r.takeaway_enabled} />
        <div className="border-t border-line pt-5">
          {locations.some((l) => l.kind === "table") ? <LocationList locations={locations} /> : <p className="text-[15px] text-muted">No tables yet. Add them below so waiters can choose where an order is for.</p>}
        </div>
        <div className="border-t border-line pt-5">
          <h3 className="mb-3 font-display text-base font-semibold text-ink">Add tables</h3>
          <AddTablesForm />
        </div>
      </Card>
    </>
  );
}
