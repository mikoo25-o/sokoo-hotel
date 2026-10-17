import { MailCheck } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { LinkButton } from "@/components/ui/Button";

export const metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthShell title="Check your email">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="h-7 w-7" aria-hidden />
        </span>
        <p className="text-[15px] text-ink">
          We sent a verification link{email ? <> to <strong>{email}</strong></> : null}. Open it on this device to finish setting up your account.
        </p>
        <p className="text-sm text-muted">Nothing arrived? Check your spam folder, or try signing up again in a few minutes.</p>
        <LinkButton href="/login" variant="secondary" block>
          Back to log in
        </LinkButton>
      </div>
    </AuthShell>
  );
}
