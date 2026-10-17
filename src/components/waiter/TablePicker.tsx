"use client";
import Link from "next/link";
import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { RoleGlyph } from "@/components/RoleGlyph";
import { cn } from "@/lib/cn";

export interface PickerLocation {
  id: string;
  name: string;
  area: string;
  kind: "table" | "takeaway";
  occupied: boolean;
}

/**
 * Every table is always tappable. "Occupied" is only information: a table can
 * have several orders (a second round, a separate bill), so availability never
 * blocks taking an order. One tap goes straight to the order screen.
 */
export function TablePicker({ locations, areas }: { locations: PickerLocation[]; areas: string[] }) {
  const [area, setArea] = useState(areas[0] ?? "");
  const shown = locations.filter((l) => l.area === area);

  return (
    <>
      <div role="tablist" aria-label="Areas" className="scroll-hide -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {areas.map((a) => {
          const on = a === area;
          return (
            <button
              key={a}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => setArea(a)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center rounded-xl border px-4 text-[15px] font-semibold",
                on ? "border-primary bg-primary text-white" : "border-line bg-white text-ink hover:bg-canvas",
              )}
            >
              {a}
            </button>
          );
        })}
      </div>

      <ul className="grid grid-cols-2 gap-3 pb-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {shown.map((l) => (
          <li key={l.id}>
            <Link
              href={`/waiter/order/new?table=${l.id}`}
              className={cn(
                "flex h-full w-full flex-col items-start rounded-2xl border p-3.5 text-left shadow-card transition-colors active:scale-[0.98]",
                l.occupied ? "border-skyline bg-sky hover:border-skyd" : "border-line bg-white hover:border-primary",
              )}
            >
              {l.kind === "takeaway" ? (
                <ShoppingBag className="h-11 w-11 text-primary" aria-hidden />
              ) : (
                <RoleGlyph name="table" className={cn("h-12 w-16", l.occupied ? "text-skyd" : "text-primary")} />
              )}
              <span className={cn("mt-2 text-base font-semibold", l.occupied ? "text-skyink" : "text-ink")}>{l.name}</span>
              <span
                className={cn(
                  "mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  l.occupied ? "bg-white text-skyink" : "bg-ok/10 text-ok",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", l.occupied ? "bg-skyd" : "bg-ok")} aria-hidden />
                {l.occupied ? "Has an order" : "Available"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">Tap any table to take an order. A busy table can still take another order.</p>
    </>
  );
}
