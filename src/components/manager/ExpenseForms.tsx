"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, ImagePlus, Plus } from "lucide-react";
import { addExpenseAction, voidExpenseAction } from "@/app/actions/manager";
import { createClient } from "@/lib/supabase/client";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { initialState } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { FormMessage, SelectInput, SubmitButton, TextInput } from "@/components/ui/Form";

const MAX = 6 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function AddForm({ restaurantId, today, onDone }: { restaurantId: string; today: string; onDone: () => void }) {
  const [state, action] = useActionState(addExpenseAction, initialState);
  const [path, setPath] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (state.ok) onDone(); }, [state.ok]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (f?: File) => {
    if (!f) return;
    setErr(null);
    const ext = TYPES[f.type];
    if (!ext) return setErr("Use a JPG, PNG or WebP photo.");
    if (f.size > MAX) return setErr("That photo is over 6 MB.");
    setBusy(true);
    const p = `${restaurantId}/receipts/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient().storage.from("expense-receipts").upload(p, f, { contentType: f.type });
    setBusy(false);
    if (error) return setErr("Upload failed. Try again.");
    setPath(p);
    setFileName(f.name);
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="receipt_path" value={path} />
      <div className="grid grid-cols-2 gap-3">
        <TextInput label="Amount (KSh)" name="amount" inputMode="decimal" error={state.fieldErrors?.amount} required />
        <TextInput label="Date" name="expense_date" type="date" defaultValue={today} max={today} error={state.fieldErrors?.expense_date} required />
      </div>
      <SelectInput label="Category" name="category" defaultValue="stock">
        {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </SelectInput>
      <TextInput label="What was it for?" name="description" maxLength={200} error={state.fieldErrors?.description} required />
      <div className="grid grid-cols-2 gap-3">
        <SelectInput label="Paid by" name="payment_method" defaultValue="cash">
          <option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="other">Other</option>
        </SelectInput>
        <TextInput label="Reference (optional)" name="payment_reference" maxLength={60} />
      </div>
      <div>
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-ink hover:bg-canvas">
          <ImagePlus className="h-4 w-4 text-primary" aria-hidden /> {fileName ? "Change receipt photo" : "Attach receipt photo"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        <p className="mt-1 text-xs text-muted">{busy ? "Uploading…" : fileName || "Optional. Kept private to managers."}</p>
        {err ? <p role="alert" className="text-sm text-danger">{err}</p> : null}
      </div>
      <FormMessage state={state} />
      <SubmitButton block disabled={busy} pendingLabel="Saving…">Save expense</SubmitButton>
    </form>
  );
}

export function AddExpense({ restaurantId, today }: { restaurantId: string; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Add expense</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New expense">
        <AddForm restaurantId={restaurantId} today={today} onDone={() => { setOpen(false); router.refresh(); }} />
      </Dialog>
    </>
  );
}

export function VoidExpense({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(voidExpenseAction, initialState);
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => { if (state.ok && !done.current) { done.current = true; setOpen(false); router.refresh(); } }, [state.ok, router]);
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Ban className="h-4 w-4 text-danger" aria-hidden /> Void</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Void this expense">
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <p className="text-sm text-muted">Voiding removes it from your totals. The record stays with your reason, so nothing disappears from the books.</p>
          <TextInput label="Reason" name="reason" maxLength={300} placeholder="Entered twice, wrong amount…" error={state.fieldErrors?.reason} required />
          <FormMessage state={state} />
          <SubmitButton variant="danger" block pendingLabel="Voiding…">Void expense</SubmitButton>
        </form>
      </Dialog>
    </>
  );
}
