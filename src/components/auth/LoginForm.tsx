"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { signIn } from "@/app/actions/auth";
import { LOGIN_ROLES } from "@/lib/constants";
import { initialState } from "@/lib/errors";
import { RoleGlyph, type GlyphName } from "@/components/RoleGlyph";
import { FormMessage, SubmitButton, TextInput } from "@/components/ui/Form";

export function LoginForm({ next, disabled }: { next?: string; disabled?: boolean }) {
  const [state, action] = useActionState(signIn, initialState);
  const [show, setShow] = useState(false);

  return (
    <form action={action} className="space-y-6" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <fieldset>
        <legend className="mb-2.5 text-[15px] font-semibold text-ink">Select your role</legend>
        <div className="grid grid-cols-2 gap-3">
          {LOGIN_ROLES.map((r, i) => (
            <label key={r.value} className="relative cursor-pointer">
              <input type="radio" name="role" value={r.value} defaultChecked={i === 0} className="peer sr-only" />
              <span
                className="flex min-h-[7.25rem] flex-col rounded-xl border border-line bg-white p-3.5 text-primary transition-colors
                  hover:bg-canvas peer-checked:border-primary peer-checked:bg-primary/10 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40"
              >
                <RoleGlyph name={r.value as GlyphName} className="h-9 w-9" />
                <span className="mt-2 text-base font-semibold text-ink">{r.label}</span>
                <span className="text-[13px] leading-snug text-muted">{r.hint}</span>
              </span>
              <span
                aria-hidden
                className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white opacity-0 peer-checked:opacity-100"
              >
                <Check className="h-4 w-4" strokeWidth={3} />
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted">Your restaurant approves which role your account can use.</p>
      </fieldset>

      <TextInput
        label="Email address"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@restaurant.com"
        leading={<Mail className="h-5 w-5" aria-hidden />}
        error={state.fieldErrors?.email}
        required
      />

      <div className="space-y-1.5">
        <TextInput
          label="Password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          placeholder="Enter your password"
          leading={<Lock className="h-5 w-5" aria-hidden />}
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
        <div className="text-right">
          <Link href="/forgot-password" className="text-sm font-medium text-primary underline underline-offset-4">
            Forgot password?
          </Link>
        </div>
      </div>

      <FormMessage state={state} />

      <SubmitButton size="lg" block pendingLabel="Signing in…" disabled={disabled}>
        Sign In <ArrowRight className="h-5 w-5" aria-hidden />
      </SubmitButton>
    </form>
  );
}
