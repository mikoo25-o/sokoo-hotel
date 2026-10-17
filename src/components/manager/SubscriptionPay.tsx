"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Smartphone, XCircle } from "lucide-react";
import { checkSubscriptionPaymentAction, startSubscriptionPaymentAction } from "@/app/actions/billing";
import { initialState } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { FormMessage, SubmitButton, TextInput, SelectInput } from "@/components/ui/Form";

export interface PayPlan {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  billing_interval: "month" | "year";
  max_staff: number | null;
}

type Phase = { kind: "idle" } | { kind: "waiting"; id: string } | { kind: "paid" } | { kind: "stopped"; text: string };

export function SubscriptionPay({ plans, enabled, defaultPhone }: { plans: PayPlan[]; enabled: boolean; defaultPhone: string }) {
  const router = useRouter();
  const [state, action] = useActionState(startSubscriptionPaymentAction, initialState);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [periods, setPeriods] = useState("1");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const handled = useRef<string | null>(null);

  const plan = plans.find((p) => p.id === planId);
  const maxPeriods = plan?.billing_interval === "year" ? 3 : 12;
  const total = plan ? plan.price_minor * Number(periods) : 0;
  const unit = plan?.billing_interval === "year" ? "year" : "month";

  // A new prompt was sent: start watching it.
  useEffect(() => {
    const id = state.ok ? (state.data?.paymentId as string | undefined) : undefined;
    if (id && handled.current !== id) {
      handled.current = id;
      setPhase({ kind: "waiting", id });
    }
  }, [state]);

  // Ask for the result every few seconds until it is settled or a few minutes pass.
  useEffect(() => {
    if (phase.kind !== "waiting") return;
    let stop = false;
    const started = Date.now();
    const tick = async () => {
      if (stop) return;
      const r = await checkSubscriptionPaymentAction(phase.id).catch(() => ({ status: "pending" }));
      if (stop) return;
      if (r.status === "paid") {
        setPhase({ kind: "paid" });
        router.refresh();
      } else if (["failed", "cancelled", "expired"].includes(r.status)) {
        setPhase({ kind: "stopped", text: r.status === "cancelled" ? "The payment was cancelled on the phone." : r.status === "expired" ? "No response from the phone, so the prompt expired." : "The payment did not go through." });
        router.refresh();
      } else if (Date.now() - started > 4 * 60_000) {
        setPhase({ kind: "stopped", text: "Still no confirmation. If money left your M-Pesa, it will appear here shortly; do not pay twice." });
      } else {
        setTimeout(tick, 4000);
      }
    };
    const t = setTimeout(tick, 4000);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [phase, router]);

  if (!plans.length) {
    return <p className="text-[15px] text-muted">No plans have been published yet, so there is nothing to pay for. SokoHotel will add plans soon.</p>;
  }

  if (phase.kind === "waiting") {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl bg-sky p-4 text-skyink">
        <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
        <div>
          <p className="font-semibold">Waiting for you to approve on your phone</p>
          <p className="text-sm">Enter your M-Pesa PIN on the prompt. This page updates by itself. Do not close it, and do not pay twice.</p>
        </div>
      </div>
    );
  }
  if (phase.kind === "paid") {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-ok/30 bg-ok/10 p-4 text-ok">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div>
          <p className="font-semibold">Payment received. Thank you.</p>
          <p className="text-sm">Your subscription is active and the new end date is shown above.</p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5" noValidate>
      {phase.kind === "stopped" ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 text-danger">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p className="text-sm">{phase.text}</p>
        </div>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Choose a plan</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {plans.map((p) => (
            <label key={p.id} className="cursor-pointer">
              <input type="radio" name="plan_id" value={p.id} checked={planId === p.id} onChange={() => { setPlanId(p.id); setPeriods("1"); }} className="peer sr-only" />
              <span className={cn("block rounded-xl border border-line bg-white p-4 transition-colors hover:bg-canvas", "peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40")}>
                <span className="block font-display font-semibold text-ink">{p.name}</span>
                <span className="block text-ink">{formatMoney(p.price_minor)} per {p.billing_interval}</span>
                {p.description ? <span className="mt-1 block text-sm text-muted">{p.description}</span> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectInput label={`How many ${unit}s?`} name="periods" value={periods} onChange={(e) => setPeriods(e.target.value)}>
          {Array.from({ length: maxPeriods }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>{n} {unit}{n === 1 ? "" : "s"}</option>
          ))}
        </SelectInput>
        <TextInput label="M-Pesa phone number" name="phone" inputMode="tel" autoComplete="tel" defaultValue={defaultPhone} placeholder="0712 345 678" error={state.fieldErrors?.phone} hint="The prompt is sent to this phone." required />
      </div>

      <FormMessage state={state.ok ? initialState : state} />
      <SubmitButton size="lg" block disabled={!enabled || !plan} pendingLabel="Sending prompt…">
        <Smartphone className="h-5 w-5" aria-hidden /> Pay {formatMoney(total)} with M-Pesa
      </SubmitButton>
      {!enabled ? <p className="text-sm text-warn">Online payment is not switched on for this server yet, so the button is off. Please contact SokoHotel support.</p> : null}
      <p className="text-sm text-muted">You approve on your own phone with your own PIN. SokoHotel never sees or stores your PIN.</p>
    </form>
  );
}
