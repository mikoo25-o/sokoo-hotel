"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ImageOff, Minus, MessageSquarePlus, Plus, Search, Send, Trash2 } from "lucide-react";
import { createOrderAction } from "@/app/actions/orders";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { useOnline } from "@/lib/use-online";

export interface BuilderItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  price_minor: number;
  image_url: string | null;
  is_available: boolean;
  fulfilment: "kitchen" | "waiter";
}
export interface BuilderCategory {
  id: string;
  name: string;
}

interface Line {
  qty: number;
  note: string;
}

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function OrderBuilder({
  locationId,
  locationName,
  locationArea,
  isTakeaway,
  categories,
  items,
}: {
  locationId: string;
  locationName: string;
  locationArea: string;
  isTakeaway: boolean;
  categories: BuilderCategory[];
  items: BuilderItem[];
}) {
  const router = useRouter();
  const draftKey = `sh_draft_${locationId}`;
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [step, setStep] = useState<"menu" | "review">("menu");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [guests, setGuests] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const online = useOnline();
  // One key per distinct cart. A retry of the same cart reuses it, so a double
  // tap or a dropped connection cannot create two orders.
  const key = useRef(newKey());
  const loaded = useRef(false);

  // Restore an unsent draft after a refresh or a lost connection.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as { lines: Record<string, Line>; guests?: string; note?: string };
        const valid: Record<string, Line> = {};
        for (const [id, l] of Object.entries(d.lines ?? {})) if (items.some((i) => i.id === id && i.is_available) && l.qty > 0) valid[id] = l;
        setLines(valid);
        setGuests(d.guests ?? "");
        setOrderNote(d.note ?? "");
      }
    } catch {
      /* storage unavailable: start empty */
    }
    loaded.current = true;
  }, [draftKey, items]);

  useEffect(() => {
    if (!loaded.current) return;
    key.current = newKey();
    try {
      if (Object.keys(lines).length) sessionStorage.setItem(draftKey, JSON.stringify({ lines, guests, note: orderNote }));
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [lines, guests, orderNote, draftKey]);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const cart = Object.entries(lines)
    .map(([id, l]) => ({ item: byId.get(id)!, ...l }))
    .filter((l) => l.item);
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const total = cart.reduce((s, l) => s + l.qty * l.item.price_minor, 0);

  const q = query.trim().toLowerCase();
  const visible = items.filter(
    (i) => (category === "all" || i.category_id === category) && (!q || i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q)),
  );
  const grouped = categories
    .map((c) => ({ category: c, items: visible.filter((i) => i.category_id === c.id) }))
    .filter((g) => g.items.length);

  const setQty = (id: string, qty: number) =>
    setLines((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = { qty: Math.min(qty, 99), note: prev[id]?.note ?? "" };
      return next;
    });

  const send = () =>
    start(async () => {
      setError(null);
      const guestNum = guests.trim() ? Number(guests) : null;
      const r = await createOrderAction({
        locationId,
        idempotencyKey: key.current,
        note: orderNote.trim() || undefined,
        guests: guestNum && Number.isInteger(guestNum) && guestNum > 0 ? guestNum : null,
        items: cart.map((l) => ({ menu_item_id: l.item.id, quantity: l.qty, note: l.note.trim() || undefined })),
      });
      if (!r.ok) {
        setError(r.message ?? "The order was not sent.");
        return;
      }
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      router.push(`/waiter/orders/${r.data?.id}/confirmation`);
    });

  const header = (
    <Card className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 bg-primary/5 p-4">
      <div>
        <p className="text-sm text-muted">{isTakeaway ? "Order type" : "Table"}</p>
        <p className="font-semibold text-ink">
          {locationName} <span className="font-normal text-muted">· {locationArea}</span>
        </p>
      </div>
      <Link href="/waiter/tables" className="ml-auto text-sm font-semibold text-primary underline underline-offset-4">
        Change
      </Link>
    </Card>
  );

  if (step === "review") {
    return (
      <>
        {header}
        <h2 className="font-display text-xl font-semibold">Review order</h2>
        <p className="mb-4 text-[15px] text-muted">Check the items, quantities and total before sending to the kitchen and cashier.</p>

        <Card className="divide-y divide-line">
          {cart.map(({ item, qty, note }) => (
            <div key={item.id} className="p-4">
              <div className="flex items-center gap-3">
                <Thumb url={item.image_url} name={item.name} className="h-14 w-14" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{item.name}</p>
                  <p className="text-sm text-muted">{formatMoney(item.price_minor)} each</p>
                </div>
                <Stepper qty={qty} onChange={(v) => setQty(item.id, v)} name={item.name} />
                <p className="hidden w-24 text-right font-semibold text-ink sm:block">{formatMoney(item.price_minor * qty)}</p>
                <button type="button" onClick={() => setQty(item.id, 0)} aria-label={`Remove ${item.name}`} className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-danger">
                  <Trash2 className="h-5 w-5" aria-hidden />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 pl-[4.25rem]">
                {noteOpen === item.id || note ? (
                  <input
                    value={note}
                    onChange={(e) => setLines((p) => ({ ...p, [item.id]: { qty, note: e.target.value.slice(0, 200) } }))}
                    placeholder="Special instructions, e.g. no onions"
                    aria-label={`Instructions for ${item.name}`}
                    className="h-10 w-full rounded-lg border border-line px-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                ) : (
                  <button type="button" onClick={() => setNoteOpen(item.id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                    <MessageSquarePlus className="h-4 w-4" aria-hidden /> Add instructions
                  </button>
                )}
                <p className="font-semibold text-ink sm:hidden">{formatMoney(item.price_minor * qty)}</p>
              </div>
            </div>
          ))}
        </Card>

        <Card className="mt-4 grid gap-4 p-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-ink">
            Guests (optional)
            <input
              inputMode="numeric"
              value={guests}
              onChange={(e) => setGuests(e.target.value.replace(/\D/g, "").slice(0, 3))}
              className="mt-1.5 block h-12 w-full rounded-xl border border-line px-3.5 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block text-sm font-medium text-ink">
            Order note (optional)
            <input
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value.slice(0, 300))}
              placeholder="For the whole order"
              className="mt-1.5 block h-12 w-full rounded-xl border border-line px-3.5 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </Card>

        <Card className="mt-4 flex items-center justify-between bg-primary/5 p-4">
          <div>
            <p className="text-sm text-muted">Total items</p>
            <p className="text-lg font-semibold text-ink">{count}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted">Total amount</p>
            <p className="font-display text-2xl font-semibold text-ink">{formatMoney(total)}</p>
          </div>
        </Card>
        <p className="mt-2 text-sm text-muted">Prices are confirmed by the server when the order is saved.</p>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-5 space-y-3 pb-4">
          <Button size="lg" block onClick={send} disabled={pending || cart.length === 0 || !online} aria-busy={pending}>
            <Send className="h-5 w-5" aria-hidden /> {!online ? "Waiting for connection…" : pending ? "Sending…" : "Send to Kitchen & Cashier"}
          </Button>
          <Button size="lg" block variant="secondary" onClick={() => setStep("menu")} disabled={pending}>
            <ArrowLeft className="h-5 w-5" aria-hidden /> Back to Add Items
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for menu items…"
          aria-label="Search menu items"
          className="h-12 w-full rounded-xl border border-line bg-white pl-11 pr-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <div role="tablist" aria-label="Categories" className="scroll-hide -mx-4 my-3 flex gap-2 overflow-x-auto px-4">
        {[{ id: "all", name: "All" }, ...categories].map((c) => (
          <button
            key={c.id}
            role="tab"
            type="button"
            aria-selected={category === c.id}
            onClick={() => setCategory(c.id)}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-[15px] font-semibold",
              category === c.id ? "border-primary bg-primary text-white" : "border-line bg-white text-ink hover:bg-canvas",
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <Card className="p-8 text-center text-[15px] text-muted">{items.length === 0 ? "The menu is empty. Ask your manager to add items." : "No items match your search."}</Card>
      ) : (
        <div className="space-y-6 pb-28">
          {grouped.map(({ category: c, items: list }) => (
            <section key={c.id} aria-labelledby={`cat-${c.id}`}>
              <h2 id={`cat-${c.id}`} className="mb-2.5 font-display text-lg font-semibold text-ink">
                {c.name}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((i) => {
                  const qty = lines[i.id]?.qty ?? 0;
                  return (
                    <li key={i.id}>
                      <Card className={cn("flex items-center gap-3 p-3", !i.is_available && "opacity-60", qty > 0 && "border-primary")}>
                        <Thumb url={i.image_url} name={i.name} className="h-20 w-20" />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold leading-tight text-ink">{i.name}</p>
                          {i.description ? <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{i.description}</p> : null}
                          <p className="mt-1 text-[15px] font-medium text-primary">{formatMoney(i.price_minor)}</p>
                          <div className="mt-2">
                            {!i.is_available ? (
                              <span className="text-sm font-semibold text-danger">Unavailable</span>
                            ) : qty === 0 ? (
                              <Button size="sm" onClick={() => setQty(i.id, 1)} aria-label={`Add ${i.name}`}>
                                <Plus className="h-4 w-4" aria-hidden /> Add
                              </Button>
                            ) : (
                              <Stepper qty={qty} onChange={(v) => setQty(i.id, v)} name={i.name} />
                            )}
                          </div>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-16 z-20 border-t border-line bg-white px-4 py-3 lg:bottom-0 lg:left-60">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">
              {count} item{count === 1 ? "" : "s"} in order
            </p>
            <p className="text-sm text-muted">{formatMoney(total)}</p>
          </div>
          <Button size="lg" onClick={() => setStep("review")} disabled={count === 0}>
            Review Order <ArrowRight className="h-5 w-5" aria-hidden />
          </Button>
        </div>
      </div>
    </>
  );
}

function Stepper({ qty, onChange, name }: { qty: number; onChange: (v: number) => void; name: string }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-white" role="group" aria-label={`Quantity of ${name}`}>
      <button type="button" onClick={() => onChange(qty - 1)} aria-label={`Remove one ${name}`} className="flex h-10 w-10 items-center justify-center rounded-l-xl text-ink hover:bg-canvas">
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-8 text-center font-semibold tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button type="button" onClick={() => onChange(qty + 1)} aria-label={`Add one ${name}`} className="flex h-10 w-10 items-center justify-center rounded-r-xl text-ink hover:bg-canvas">
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function Thumb({ url, name, className }: { url: string | null; name: string; className?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name} loading="lazy" decoding="async" className={cn("shrink-0 rounded-xl bg-canvas object-cover", className)} />
  ) : (
    <span className={cn("flex shrink-0 items-center justify-center rounded-xl bg-canvas text-muted", className)} role="img" aria-label={`${name}, no photo`}>
      <ImageOff className="h-6 w-6" aria-hidden />
    </span>
  );
}
