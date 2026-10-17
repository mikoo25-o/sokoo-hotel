"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CookingPot, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { bulkSetStatusAction, setItemStatusAction } from "@/app/actions/orders";
import type { ItemStatus } from "@/lib/constants";

export function KitchenItemButtons({ itemId, status }: { itemId: string; status: ItemStatus }) {
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

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {status === "pending" ? (
        <Button size="sm" onClick={() => run("preparing")} disabled={pending}>
          <CookingPot className="h-4 w-4" aria-hidden /> Start
        </Button>
      ) : null}
      {status === "preparing" ? (
        <>
          <Button size="sm" onClick={() => run("ready")} disabled={pending}>
            <Check className="h-4 w-4" aria-hidden /> Ready
          </Button>
          <Button size="sm" variant="secondary" onClick={() => run("pending")} disabled={pending} aria-label="Move back to pending">
            <Undo2 className="h-4 w-4" aria-hidden />
          </Button>
        </>
      ) : null}
      {status === "ready" ? (
        <Button size="sm" variant="secondary" onClick={() => run("preparing")} disabled={pending} aria-label="Move back to preparing">
          <Undo2 className="h-4 w-4" aria-hidden /> Undo
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="w-full text-right text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function KitchenOrderButtons({ orderId, canStart, canFinish }: { orderId: string; canStart: boolean; canFinish: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (to: string) =>
    start(async () => {
      setMessage(null);
      const r = await bulkSetStatusAction(orderId, to);
      setMessage({ ok: r.ok, text: r.message ?? (r.ok ? "Updated." : "Could not update.") });
      router.refresh();
    });
  return (
    <div className="space-y-3">
      <Button size="lg" block onClick={() => run("preparing")} disabled={pending || !canStart}>
        <CookingPot className="h-5 w-5" aria-hidden /> Mark all as Preparing
      </Button>
      <Button size="lg" block variant="secondary" onClick={() => run("ready")} disabled={pending || !canFinish}>
        <Check className="h-5 w-5" aria-hidden /> Mark all as Ready
      </Button>
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-ok" : "text-sm text-danger"}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
