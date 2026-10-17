"use client";
import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Undo2 } from "lucide-react";
import { reversePaymentAction, verifyPaymentAction } from "@/app/actions/orders";
import { initialState } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { FormMessage, SubmitButton, TextInput } from "@/components/ui/Form";

export function VerifyButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await verifyPaymentAction(paymentId);
            setError(r.ok ? null : (r.message ?? "Could not verify."));
            router.refresh();
          })
        }
      >
        <BadgeCheck className="h-4 w-4" aria-hidden /> Mark verified
      </Button>
      {error ? <p role="alert" className="mt-1 text-sm text-danger">{error}</p> : null}
    </div>
  );
}

export function ReverseForm({ paymentId }: { paymentId: string }) {
  const [state, action] = useActionState(reversePaymentAction, initialState);
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Undo2 className="h-4 w-4" aria-hidden /> Reverse
      </Button>
    );
  }
  return (
    <form action={action} className="mt-3 w-full space-y-3 rounded-xl border border-danger/30 bg-danger/5 p-3.5">
      <input type="hidden" name="payment_id" value={paymentId} />
      <TextInput label="Why is this payment being reversed?" name="reason" maxLength={300} required placeholder="For example: wrong order, customer refunded" />
      <p className="text-sm text-muted">The payment stays in the record as reversed. It is not deleted.</p>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton size="sm" variant="danger" pendingLabel="Reversing…">Reverse payment</SubmitButton>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  );
}
