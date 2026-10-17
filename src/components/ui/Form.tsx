"use client";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useOnline } from "@/lib/use-online";
import { Button } from "@/components/ui/Button";
import type { ActionState } from "@/lib/errors";

const control =
  "block w-full rounded-xl border border-line bg-white px-3.5 text-ink placeholder:text-muted/80 " +
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-canvas disabled:text-muted";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children(id, describedBy)}
      {error ? (
        <p id={`${id}-err`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; fieldClassName?: string; leading?: ReactNode; trailing?: ReactNode }
>(function TextInput({ label, hint, error, className, fieldClassName, leading, trailing, ...rest }, ref) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {(id, describedBy) => (
        <div className="relative">
          {leading ? <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-muted">{leading}</span> : null}
          <input
            ref={ref}
            id={id}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            className={cn(control, "h-12", leading && "pl-11", trailing && "pr-12", error && "border-danger", className)}
            {...rest}
          />
          {trailing ? <span className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</span> : null}
        </div>
      )}
    </Field>
  );
});

export function SelectInput({
  label,
  hint,
  error,
  className,
  fieldClassName,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string; fieldClassName?: string }) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {(id, describedBy) => (
        <select id={id} aria-describedby={describedBy} className={cn(control, "h-12", className)} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className,
  fieldClassName,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string; fieldClassName?: string }) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {(id, describedBy) => (
        <textarea id={id} aria-describedby={describedBy} className={cn(control, "min-h-24 py-3", className)} {...rest} />
      )}
    </Field>
  );
}

/** Submit button that shows a spinner while its parent form's action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  variant,
  size,
  block,
  className,
  disabled,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "dark";
  size?: "sm" | "md" | "lg";
  block?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const online = useOnline();
  return (
    <Button type="submit" variant={variant} size={size} block={block} className={className} disabled={pending || disabled || !online} aria-busy={pending}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {!online ? "Waiting for connection…" : pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}

/** Shows the result of a server action under a form. */
export function FormMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;
  const ok = state.ok;
  return (
    <div
      role={ok ? "status" : "alert"}
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3.5 py-3 text-sm",
        ok ? "border-ok/30 bg-ok/10 text-ok" : "border-danger/30 bg-danger/5 text-danger",
      )}
    >
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <span>{state.message}</span>
    </div>
  );
}
