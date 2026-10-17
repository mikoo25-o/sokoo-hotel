"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addLocationsAction, saveSettingsAction, setLocationActiveAction, setTakeawayAction } from "@/app/actions/manager";
import { TIMEZONE_OPTIONS } from "@/lib/constants";
import { initialState } from "@/lib/errors";
import type { Restaurant, ServiceLocation } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormMessage, SelectInput, SubmitButton, TextArea, TextInput } from "@/components/ui/Form";

export function RestaurantForm({ r }: { r: Restaurant }) {
  const [state, action] = useActionState(saveSettingsAction, initialState);
  const s = r.settings ?? {};
  return (
    <form action={action} className="space-y-4">
      <TextInput label="Restaurant name" name="name" defaultValue={r.name} maxLength={80} error={state.fieldErrors?.name} required />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Phone" name="phone" defaultValue={r.phone ?? ""} inputMode="tel" error={state.fieldErrors?.phone} />
        <TextInput label="Email" name="email" type="email" defaultValue={r.email ?? ""} error={state.fieldErrors?.email} />
      </div>
      <TextInput label="Address" name="address" defaultValue={r.address ?? ""} maxLength={200} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput label="Time zone" name="timezone" defaultValue={r.timezone} hint="Decides when a business day starts and ends in reports.">
          {TIMEZONE_OPTIONS.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </SelectInput>
        <TextInput label="Currency" value="Kenyan shilling (KES)" readOnly disabled hint="More currencies are not available yet." />
      </div>
      <TextInput label="Receipt header" name="receipt_header" defaultValue={r.receipt_header ?? ""} maxLength={120} placeholder="Shown under your name on receipts" />
      <TextArea label="Receipt footer" name="receipt_footer" defaultValue={r.receipt_footer ?? ""} maxLength={160} rows={2} placeholder="Thank you for dining with us." />
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium text-ink">Notification preferences</legend>
        <label className="flex min-h-11 items-center gap-3 text-[15px]"><input type="checkbox" name="notify_new_orders" defaultChecked={s.notify_new_orders !== false} className="h-5 w-5 accent-[rgb(var(--color-primary))]" /> Show new orders on screen as they arrive</label>
        <label className="flex min-h-11 items-center gap-3 text-[15px]"><input type="checkbox" name="notify_payments" defaultChecked={s.notify_payments !== false} className="h-5 w-5 accent-[rgb(var(--color-primary))]" /> Show payments as they are recorded</label>
        <p className="text-sm text-muted">These control what appears in the app. Email and SMS alerts are not available yet.</p>
      </fieldset>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
    </form>
  );
}

export function AddTablesForm({ onDone }: { onDone?: () => void }) {
  const [state, action] = useActionState(addLocationsAction, initialState);
  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state.ok]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Area" name="area" defaultValue="Main Hall" maxLength={40} error={state.fieldErrors?.area} required />
        <TextInput label="Name prefix" name="prefix" defaultValue="Table" maxLength={20} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <TextInput label="From number" name="from" type="number" inputMode="numeric" min={1} max={999} defaultValue={1} error={state.fieldErrors?.from} required />
        <TextInput label="To number" name="to" type="number" inputMode="numeric" min={1} max={999} defaultValue={10} error={state.fieldErrors?.to} required />
        <TextInput label="Seats (optional)" name="seats" type="number" inputMode="numeric" min={1} max={50} />
      </div>
      <p className="text-sm text-muted">One table: use the same number twice. For example 1 to 10 creates Table 1 through Table 10.</p>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Adding…">Add tables</SubmitButton>
    </form>
  );
}

export function LocationList({ locations }: { locations: ServiceLocation[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const toggle = (id: string, active: boolean) =>
    start(async () => { const r = await setLocationActiveAction(id, active); setErr(r.ok ? null : (r.message ?? "Could not save.")); router.refresh(); });
  const areas = [...new Set(locations.filter((l) => l.kind === "table").map((l) => l.area))];
  return (
    <div className="space-y-4">
      {err ? <p role="alert" className="text-sm text-danger">{err}</p> : null}
      {areas.map((a) => (
        <div key={a}>
          <h3 className="mb-2 text-sm font-semibold text-muted">{a}</h3>
          <ul className="flex flex-wrap gap-2">
            {locations.filter((l) => l.kind === "table" && l.area === a).map((l) => (
              <li key={l.id}>
                <button type="button" disabled={pending} onClick={() => toggle(l.id, !l.is_active)} aria-pressed={l.is_active}
                  title={l.is_active ? "Tap to hide this table" : "Tap to show this table again"}
                  className={`min-h-10 rounded-xl border px-3 text-sm font-medium ${l.is_active ? "border-line bg-white text-ink" : "border-dashed border-line bg-canvas text-muted line-through"}`}>
                  {l.name}{l.seats ? ` · ${l.seats}` : ""}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {areas.length ? <p className="text-xs text-muted">Tap a table to hide or show it. Hidden tables keep their order history.</p> : null}
    </div>
  );
}

export function TakeawayToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <p className="font-medium text-ink">Takeaway orders</p>
        <p className="text-sm text-muted">Adds a Takeaway option when waiters choose where an order is for.</p>
        {msg ? <p role="alert" className="text-sm text-danger">{msg}</p> : null}
      </div>
      <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "On" : "Off"}</Badge>
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => { const r = await setTakeawayAction(!enabled); setMsg(r.ok ? null : (r.message ?? "Could not save.")); router.refresh(); })}>
        {enabled ? "Turn off" : "Turn on"}
      </Button>
    </div>
  );
}
