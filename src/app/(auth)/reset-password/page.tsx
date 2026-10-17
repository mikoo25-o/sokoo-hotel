import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { ResetPasswordForm } from "@/components/auth/SimpleForms";
import { getContext } from "@/lib/session";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const ctx = await getContext();
  // The reset link signs the person in briefly. Without that session there is nothing to reset.
  if (!ctx) redirect("/login?error=link");
  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Pick something you have not used before."
      footer={<Link href="/login" className="font-semibold text-primary underline underline-offset-4">Cancel</Link>}
    >
      <ResetPasswordForm />
    </AuthShell>
  );
}
