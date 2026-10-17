"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { saveCategoryAction, saveMenuItemAction, setCategoryActiveAction, setItemFlagAction } from "@/app/actions/manager";
import { createClient } from "@/lib/supabase/client";
import { initialState } from "@/lib/errors";
import { formatMoney, minorToInput } from "@/lib/money";
import { n } from "@/lib/types";
import type { MenuCategory, MenuItem } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, EmptyState } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { FormMessage, SelectInput, SubmitButton, TextArea, TextInput } from "@/components/ui/Form";
import { Thumb } from "@/components/waiter/OrderBuilder";

type Item = MenuItem & { image_url: string | null };
const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function CategoryForm({ category, onDone }: { category?: MenuCategory; onDone: () => void }) {
  const [state, action] = useActionState(saveCategoryAction, initialState);
  useEffect(() => { if (state.ok) onDone(); }, [state.ok]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={category?.id ?? ""} />
      <TextInput label="Category name" name="name" defaultValue={category?.name} maxLength={60} placeholder="Mains, Drinks, Desserts" error={state.fieldErrors?.name} required />
      <FormMessage state={state} />
      <SubmitButton block pendingLabel="Saving…">Save category</SubmitButton>
    </form>
  );
}

function ItemForm({ restaurantId, categories, item, defaultCategory, onDone }: { restaurantId: string; categories: MenuCategory[]; item?: Item; defaultCategory?: string; onDone: () => void }) {
  const [state, action] = useActionState(saveMenuItemAction, initialState);
  const [path, setPath] = useState(item?.image_path ?? "");
  const [preview, setPreview] = useState(item?.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  useEffect(() => { if (state.ok) onDone(); }, [state.ok]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    const ext = TYPES[file.type];
    if (!ext) return setUploadError("Use a JPG, PNG or WebP photo.");
    if (file.size > MAX_BYTES) return setUploadError("That photo is over 4 MB. Choose a smaller one.");
    setUploading(true);
    const objectPath = `${restaurantId}/menu/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient().storage.from("menu-images").upload(objectPath, file, { contentType: file.type, upsert: false });
    setUploading(false);
    if (error) return setUploadError("Upload failed. Check your connection and try again.");
    setPath(objectPath);
    setPreview(URL.createObjectURL(file));
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={item?.id ?? ""} />
      <input type="hidden" name="image_path" value={path} />
      <div className="flex items-center gap-4">
        <Thumb url={preview} name={item?.name ?? "New item"} className="h-20 w-20" />
        <div>
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-canvas">
            <ImagePlus className="h-4 w-4 text-primary" aria-hidden /> {preview ? "Change photo" : "Add photo"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          <p className="mt-1 text-xs text-muted">{uploading ? "Uploading…" : "JPG, PNG or WebP, up to 4 MB."}</p>
          {path ? <button type="button" className="mt-1 text-xs font-medium text-danger underline" onClick={() => { setPath(""); setPreview(null); }}>Remove photo</button> : null}
        </div>
      </div>
      {uploadError ? <p role="alert" className="text-sm text-danger">{uploadError}</p> : null}
      <TextInput label="Item name" name="name" defaultValue={item?.name} maxLength={80} error={state.fieldErrors?.name} required />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Price (KSh)" name="price" inputMode="decimal" defaultValue={item ? minorToInput(n(item.price_minor)) : ""} error={state.fieldErrors?.price} required />
        <SelectInput label="Category" name="category_id" defaultValue={item?.category_id ?? defaultCategory} error={state.fieldErrors?.category_id} required>
          {categories.filter((c) => c.is_active || c.id === item?.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectInput>
      </div>
      <TextArea label="Description (optional)" name="description" defaultValue={item?.description ?? ""} maxLength={300} rows={2} />
      <SelectInput label="Who prepares it?" name="fulfilment" defaultValue={item?.fulfilment ?? "kitchen"} hint="Kitchen items go to the kitchen screen. Waiter items, like bottled drinks, are released by the waiter directly.">
        <option value="kitchen">Kitchen</option>
        <option value="waiter">Waiter releases it</option>
      </SelectInput>
      <label className="flex min-h-11 items-center gap-3 text-[15px] text-ink">
        <input type="checkbox" name="is_available" defaultChecked={item?.is_available ?? true} className="h-5 w-5 accent-[rgb(var(--color-primary))]" /> Available to order today
      </label>
      <FormMessage state={state} />
      <SubmitButton block disabled={uploading} pendingLabel="Saving…">Save item</SubmitButton>
    </form>
  );
}

export function MenuManager({ restaurantId, categories, items }: { restaurantId: string; categories: MenuCategory[]; items: Item[] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [dlg, setDlg] = useState<null | { kind: "cat"; cat?: MenuCategory } | { kind: "item"; item?: Item; category?: string }>(null);
  const [note, setNote] = useState<string | null>(null);
  const close = () => { setDlg(null); router.refresh(); };
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => { const r = await fn(); setNote(r.ok ? null : (r.message ?? "Could not save.")); router.refresh(); });

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setDlg({ kind: "cat" })} variant="secondary"><Plus className="h-4 w-4" aria-hidden /> Category</Button>
        <Button onClick={() => setDlg({ kind: "item" })} disabled={!categories.length}><Plus className="h-4 w-4" aria-hidden /> Menu item</Button>
      </div>
      {note ? <p role="alert" className="mb-3 text-sm text-danger">{note}</p> : null}

      {!categories.length ? (
        <EmptyState icon={<UtensilsCrossed className="h-6 w-6" aria-hidden />} title="Your menu is empty" action={<Button onClick={() => setDlg({ kind: "cat" })}>Add first category</Button>}>
          Start with a category such as Mains or Drinks, then add items with prices.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {categories.map((c) => {
            const list = items.filter((i) => i.category_id === c.id);
            return (
              <section key={c.id} aria-label={c.name}>
                <div className="mb-2 flex items-center gap-2">
                  <h2 className="font-display text-lg font-semibold text-ink">{c.name}</h2>
                  {!c.is_active ? <Badge tone="neutral">Hidden</Badge> : null}
                  <div className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Rename ${c.name}`} onClick={() => setDlg({ kind: "cat", cat: c })}><Pencil className="h-4 w-4" aria-hidden /></Button>
                    <Button size="sm" variant="ghost" aria-label={c.is_active ? `Hide ${c.name}` : `Show ${c.name}`} onClick={() => run(() => setCategoryActiveAction(c.id, !c.is_active))}>{c.is_active ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}</Button>
                    <Button size="sm" variant="secondary" onClick={() => setDlg({ kind: "item", category: c.id })}><Plus className="h-4 w-4" aria-hidden /> Item</Button>
                  </div>
                </div>
                {list.length === 0 ? (
                  <Card className="p-4 text-sm text-muted">No items in this category yet.</Card>
                ) : (
                  <Card><ul className="divide-y divide-line">
                    {list.map((i) => (
                      <li key={i.id} className={`flex items-center gap-3 p-3.5 ${i.is_active ? "" : "opacity-60"}`}>
                        <Thumb url={i.image_url} name={i.name} className="h-14 w-14" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-ink">{i.name}</p>
                          <p className="text-sm text-muted">{formatMoney(i.price_minor)} · {i.fulfilment === "kitchen" ? "Kitchen" : "Waiter releases"}</p>
                          <div className="mt-1 flex gap-1.5">
                            {!i.is_available ? <Badge tone="warn">Sold out</Badge> : null}
                            {!i.is_active ? <Badge>Archived</Badge> : null}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5 sm:flex-row">
                          <Button size="sm" variant="secondary" onClick={() => setDlg({ kind: "item", item: i })}><Pencil className="h-4 w-4" aria-hidden /> Edit</Button>
                          {i.is_active ? (
                            <>
                              <Button size="sm" variant="secondary" onClick={() => run(() => setItemFlagAction(i.id, "is_available", !i.is_available))}>{i.is_available ? "Mark sold out" : "Back in stock"}</Button>
                              <Button size="sm" variant="ghost" aria-label={`Archive ${i.name}`} onClick={() => run(() => setItemFlagAction(i.id, "is_active", false))}><Trash2 className="h-4 w-4 text-danger" aria-hidden /></Button>
                            </>
                          ) : (
                            <Button size="sm" variant="secondary" onClick={() => run(() => setItemFlagAction(i.id, "is_active", true))}>Restore</Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul></Card>
                )}
              </section>
            );
          })}
          <p className="text-sm text-muted">Archiving hides an item from ordering but keeps it on old bills. Changing a price never changes past orders.</p>
        </div>
      )}

      <Dialog open={dlg?.kind === "cat"} onClose={() => setDlg(null)} title={dlg?.kind === "cat" && dlg.cat ? "Rename category" : "New category"}>
        {dlg?.kind === "cat" ? <CategoryForm category={dlg.cat} onDone={close} /> : null}
      </Dialog>
      <Dialog open={dlg?.kind === "item"} onClose={() => setDlg(null)} title={dlg?.kind === "item" && dlg.item ? "Edit menu item" : "New menu item"}>
        {dlg?.kind === "item" ? <ItemForm restaurantId={restaurantId} categories={categories} item={dlg.item} defaultCategory={dlg.category} onDone={close} /> : null}
      </Dialog>
    </>
  );
}
