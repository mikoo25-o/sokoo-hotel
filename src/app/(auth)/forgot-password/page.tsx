import Link from "next/link";
import { AuthShell, SetupNotice } from "@/components/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/SimpleForms";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  const configured = isSupabaseConfigured();
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we will send you a link to choose a new password."
      footer={<Link href="/login" className="font-semibold text-primary underline underline-offset-4">Back to log in</Link>}
    >
      {!configured ? <SetupNotice /> : null}
      <ForgotPasswordForm disabled={!configured} />
    </AuthShell>
  );
}
