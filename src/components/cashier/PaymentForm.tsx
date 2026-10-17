"use client";
import { useActionState, useState } from "react";
import { Banknote, Smartphone } from "lucide-react";
import { recordPaymentAction } from "@/app/actions/orders";
import { initialState } from "@/lib/errors";
import { formatMoney, minorToInput } from "@/lib/money";
import { cn } from "@/lib/cn";
import { FormMessage, SubmitButton, TextInput } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function PaymentForm({ orderId, balanceMinor }: { orderId: string; balanceMinor: number }) {
  const [state, action] = useActionState(recordPaymentAction, initialState);
  const [method, setMethod] = useState<"cash" | "mpesa">("cash");
  const [amount, setAmount] = useState(minorToInput(balanceMinor));
  // Same key for the same payment, so a double tap or a retry never records it twice.
  const [key, setKey] = useState(newKey);

  return (
    <form action={action} onChange={() => setKey(newKey())} className="space-y-5" noValidate>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="key" value={key} />

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Payment method</legend>
        <div className="grid grid-cols-2 gap-3">
          {[
            { v: "cash", label: "Cash", icon: Banknote },
            { v: "mpesa", label: "M-Pesa", icon: Smartphone },
          ].map(({ v, label, icon: Icon }) => (
            <label key={v} className="cursor-pointer">
              <input type="radio" name="method" value={v} checked={method === v} onChange={() => setMethod(v as "cash" | "mpesa")} className="peer sr-only" />
              <span
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-xl border border-line px-4 font-semibold text-ink transition-colors hover:bg-canvas",
                  "peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40",
                )}
              >
                <Icon className="h-6 w-6 text-primary" aria-hidden /> {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <TextInput
          label="Amount received (KSh)"
          name="amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={state.fieldErrors?.amount}
          hint={`Remaining balance: ${formatMoney(balanceMinor)}. Enter less for a part payment.`}
          required
        />
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setAmount(minorToInput(balanceMinor))}>
            Full balance
          </Button>
          {balanceMinor >= 200 ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => setAmount(minorToInput(Math.floor(balanceMinor / 200) * 100))}>
              Half
            </Button>
          ) : null}
        </div>
      </div>

      {method === "mpesa" ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <TextInput
            label="M-Pesa confirmation code"
            name="txn"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            maxLength={12}
            placeholder="QJK7L8M9N0"
            className="font-mono uppercase tracking-wider"
            error={state.fieldErrors?.txn}
            required
          />
          <p className="mt-2 text-sm text-muted">
            Type the code from the customer&apos;s M-Pesa message. Never ask for or enter a customer&apos;s PIN. The payment is saved as <strong className="text-ink">Unverified</strong> until a
            manager matches the code to the M-Pesa statement. SokoHotel does not confirm M-Pesa payments automatically.
          </p>
        </div>
      ) : null}

      <FormMessage state={state} />
      <SubmitButton size="lg" block pendingLabel="Saving payment…">
        Confirm payment
      </SubmitButton>
    </form>
  );
}
