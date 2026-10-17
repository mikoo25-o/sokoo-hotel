"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Eye, EyeOff, KeyRound, Store } from "lucide-react";
import { signUp } from "@/app/actions/auth";
import { initialState } from "@/lib/errors";
import { cn } from "@/lib/cn";
import { FormMessage, SubmitButton, TextInput } from "@/components/ui/Form";

const PATHS = [
  { value: "create", icon: Store, title: "Create a new restaurant", hint: "I own or manage it and want to set it up" },
  { value: "join", icon: KeyRound, title: "Join an existing restaurant", hint: "I have a joining code from my manager" },
] as const;

export function SignupForm({ initialPath, code, disabled }: { initialPath: "create" | "join"; code?: string; disabled?: boolean }) {
  const [state, action] = useActionState(signUp, initialState);
  const [path, setPath] = useState<"create" | "join">(initialPath);
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="space-y-5" noValidate>
      {code ? <input type="hidden" name="code" value={code} /> : null}
      <fieldset>
        <legend className="mb-2.5 text-[15px] font-semibold text-ink">What would you like to do?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {PATHS.map(({ value, icon: Icon, title, hint }) => (
            <label key={value} className="cursor-pointer">
              <input type="radio" name="path" value={value} checked={path === value} onChange={() => setPath(value)} className="peer sr-only" />
              <span
                className={cn(
                  "flex h-full gap-3 rounded-xl border border-line p-3.5 transition-colors hover:bg-canvas",
                  "peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40",
                )}
              >
                <Icon className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden />
                <span>
                  <span className="block text-[15px] font-semibold text-ink">{title}</span>
                  <span className="block text-[13px] leading-snug text-muted">{hint}</span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <TextInput label="Full name" name="full_name" autoComplete="name" error={state.fieldErrors?.full_name} required />
      <TextInput label="Email address" name="email" type="email" inputMode="email" autoComplete="email" placeholder="you@restaurant.com" error={state.fieldErrors?.email} required />
      <TextInput label="Phone (optional)" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0712 345 678" error={state.fieldErrors?.phone} />
      <TextInput
        label="Password"
        name="password"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        hint="At least 8 characters, with a letter and a number."
        error={state.fieldErrors?.password}
        trailing={
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-canvas"
          >
            {show ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
          </button>
        }
        required
      />
      <FormMessage state={state} />
      <SubmitButton size="lg" block pendingLabel="Creating account…" disabled={disabled}>
        Create account
      </SubmitButton>
      <p className="text-center text-sm text-muted">
        We will email you a link to verify your address.{" "}
        <Link href="/login" className="font-semibold text-primary underline underline-offset-4">
          I already have an account
        </Link>
      </p>
    </form>
  );
}
