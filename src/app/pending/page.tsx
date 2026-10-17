import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, CircleCheck, CircleX } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { LinkButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { signOut } from "@/app/actions/auth";
import { createClient } from "@/lib/supabase/server";
import { getContext, homeFor } from "@/lib/session";
import { formatDateTime } from "@/lib/dates";

export const dynamic = "force-dynamic";

export const metadata = { title: "Waiting for approval" };

interface Req {
  id: string;
  restaurant_name: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
}

export default async function PendingPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (ctx.workspaces.length) redirect(homeFor(ctx));
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_join_requests");
  const requests = (data ?? []) as Req[];
  const pending = requests.filter((r) => r.status === "pending");

  return (
    <AuthShell
      title={pending.length ? "Waiting for approval" : "Your requests"}
      subtitle={
        pending.length
          ? "A manager needs to approve you before you can sign in to the restaurant. This page updates when you refresh."
          : "You are not a member of any restaurant yet."
      }
      footer={
        <form action={signOut}>
          <button className="font-semibold text-primary underline underline-offset-4">Log out</button>
        </form>
      }
    >
      {requests.length ? (
        <ul className="space-y-3">
          {requests.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-line p-3.5">
              {r.status === "pending" ? <Clock className="h-5 w-5 text-warn" aria-hidden /> : r.status === "approved" ? <CircleCheck className="h-5 w-5 text-primary" aria-hidden /> : <CircleX className="h-5 w-5 text-danger" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{r.restaurant_name}</p>
                <p className="text-sm text-muted">Sent {formatDateTime(r.created_at)}</p>
              </div>
              <Badge tone={r.status === "pending" ? "warn" : r.status === "approved" ? "success" : "danger"}>
                {r.status === "pending" ? "Pending" : r.status === "approved" ? "Approved" : r.status === "rejected" ? "Declined" : "Cancelled"}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-5 space-y-3">
        <LinkButton href="/pending" variant="secondary" block>
          Refresh status
        </LinkButton>
        <LinkButton href="/onboarding/join" variant="ghost" block>
          Enter a different code
        </LinkButton>
      </div>
      <p className="mt-4 text-center text-sm text-muted">
        Declined by mistake? Ask your manager, then{" "}
        <Link href="/onboarding/join" className="font-medium text-primary underline underline-offset-4">
          send a new request
        </Link>
        .
      </p>
    </AuthShell>
  );
}
