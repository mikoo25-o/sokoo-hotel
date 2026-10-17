"use client";
import { useActionState } from "react";
import { requestPasswordReset, updatePassword, createRestaurant, joinRestaurant, updateProfile } from "@/app/actions/auth";
import { initialState } from "@/lib/errors";
import { FormMessage, SelectInput, SubmitButton, TextArea, TextInput } from "@/components/ui/Form";

export function ForgotPasswordForm({ disabled }: { disabled?: boolean }) {
  const [state, action] = useActionState(requestPasswordReset, initialState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <TextInput label="Email address" name="email" type="email" inputMode="email" autoComplete="email" error={state.fieldErrors?.email} required />
      <FormMessage state={state} />
      <SubmitButton size="lg" block pendingLabel="Sending…" disabled={disabled}>
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, initialState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <TextInput label="New password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters, with a letter and a number." error={state.fieldErrors?.password} required />
      <TextInput label="Confirm new password" name="confirm" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} required />
      <FormMessage state={state} />
      <SubmitButton size="lg" block pendingLabel="Saving…">
        Update password
      </SubmitButton>
    </form>
  );
}

export function CreateRestaurantForm() {
  const [state, action] = useActionState(createRestaurant, initialState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <TextInput label="Restaurant name" name="name" placeholder="Sunrise Restaurant" autoComplete="organization" error={state.fieldErrors?.name} required />
      <TextInput label="Phone (optional)" name="phone" type="tel" inputMode="tel" placeholder="0712 345 678" error={state.fieldErrors?.phone} />
      <TextInput label="Location (optional)" name="address" placeholder="Town, street or building" error={state.fieldErrors?.address} />
      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line p-3.5">
        <input type="checkbox" name="takeaway" defaultChecked className="mt-1 h-5 w-5 accent-primary" />
        <span>
          <span className="block text-[15px] font-medium text-ink">We offer takeaway</span>
          <span className="block text-sm text-muted">Adds a Takeaway option next to your tables. You can change this later.</span>
        </span>
      </label>
      <FormMessage state={state} />
      <SubmitButton size="lg" block pendingLabel="Creating…">
        Create restaurant
      </SubmitButton>
    </form>
  );
}

export function JoinRestaurantForm({ code }: { code?: string }) {
  const [state, action] = useActionState(joinRestaurant, initialState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <TextInput
        label="Restaurant joining code"
        name="code"
        defaultValue={code}
        placeholder="SOKO7K4M9Q"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        className="font-mono uppercase tracking-wider"
        error={state.fieldErrors?.code}
        hint="Ask your manager. The code only lets you send a request. A manager must approve you."
        required
      />
      <SelectInput label="What will you do? (optional)" name="role" defaultValue="" hint="Your manager makes the final choice.">
        <option value="">Not sure yet</option>
        <option value="waiter">Waiter</option>
        <option value="kitchen">Kitchen</option>
        <option value="cashier">Cashier</option>
      </SelectInput>
      <TextArea label="Note to the manager (optional)" name="message" maxLength={300} rows={3} placeholder="For example: I start on Monday." />
      <FormMessage state={state} />
      <SubmitButton size="lg" block pendingLabel="Sending request…">
        Request to join
      </SubmitButton>
    </form>
  );
}

export function ProfileForm({ name, phone }: { name: string; phone: string }) {
  const [state, action] = useActionState(updateProfile, initialState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <TextInput label="Full name" name="full_name" defaultValue={name} error={state.fieldErrors?.full_name} required />
      <TextInput label="Phone" name="phone" type="tel" defaultValue={phone} error={state.fieldErrors?.phone} />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
    </form>
  );
}
