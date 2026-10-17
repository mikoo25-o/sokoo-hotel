"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { bulkSetStatusAction, setItemStatusAction } from "@/app/actions/orders";
import type { ItemStatus } from "@/lib/constants";

/** Serve / cancel buttons for one item. Which ones appear matches what the database will allow. */
export function ItemActions({
  itemId,
  status,
  fulfilment,
  canCancel,
}: {
  itemId: string;
  status: ItemStatus;
  fulfilment: "kitchen" | "waiter";
  canCancel: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (to: string) =>
    start(async () => {
      setError(null);
      const r = await setItemStatusAction(itemId, to);
      if (!r.ok) setError(r.message ?? "Could not update.");
      router.refresh();
    });

  const cancellable = canCancel && ((fulfilment === "kitchen" && status === "pending") || (fulfilment === "waiter" && status === "ready"));
  if (status !== "ready" && !cancellable) return null;

  return (
    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
      {status === "ready" ? (
        <Button size="sm" onClick={() => run("served")} disabled={pending}>
          <Check className="h-4 w-4" aria-hidden /> Serve
        </Button>
      ) : null}
      {cancellable ? (
        <Button size="sm" variant="secondary" onClick={() => run("cancelled")} disabled={pending} aria-label="Cancel item">
          <X className="h-4 w-4" aria-hidden /> Cancel
        </Button>
      ) : null}
      {error ? <p role="alert" className="w-full text-right text-sm text-danger">{error}</p> : null}
    </div>
  );
}

export function ServeAllButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        block
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await bulkSetStatusAction(orderId, "served");
            if (!r.ok) setError(r.message ?? "Could not update.");
            router.refresh();
          })
        }
      >
        <Check className="h-5 w-5" aria-hidden /> Serve everything that is ready
      </Button>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
