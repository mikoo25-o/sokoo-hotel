import QRCode from "qrcode";
import { ShieldCheck, Users } from "lucide-react";
import { Card, EmptyState, PageHeader, SectionTitle } from "@/components/ui/Card";
import { JoinCodeCard, MemberRow, RequestRow } from "@/components/manager/StaffControls";
import { createClient } from "@/lib/supabase/server";
import { MANAGERS, requireRole } from "@/lib/session";
import { siteUrl } from "@/lib/env";
import { formatDateTime } from "@/lib/dates";
import type { Profile } from "@/lib/types";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const ctx = await requireRole(MANAGERS);
  const r = ctx.current.restaurant;
  const tz = r.timezone;
  const supabase = await createClient();

  const [{ data: code }, { data: reqs }, { data: members }] = await Promise.all([
    supabase.rpc("get_join_code", { p_restaurant: r.id }),
    supabase.from("join_requests").select("id, user_id, requested_role, message, created_at").eq("status", "pending").order("created_at"),
    supabase.from("memberships").select("id, user_id, role, status").order("created_at"),
  ]);
  const ids = [...new Set([...(reqs ?? []).map((x) => x.user_id), ...(members ?? []).map((x) => x.user_id)])];
  const { data: profs } = ids.length ? await supabase.from("profiles").select("id, full_name, phone").in("id", ids) : { data: [] };
  const byId = new Map(((profs ?? []) as Profile[]).map((p) => [p.id, p]));

  const joinCode = (code as string | null) ?? null;
  const link = joinCode ? `${siteUrl()}/join?code=${joinCode}` : null;
  const qr = link ? await QRCode.toDataURL(link, { margin: 1, width: 264, color: { dark: "#7C2D12", light: "#FFFFFF" } }) : null;

  return (
    <>
      <PageHeader title="Staff" subtitle="Invite your team, approve who joins and set what each person can do." />
      <JoinCodeCard code={joinCode} link={link} qr={qr} />

      <SectionTitle>Waiting for approval {reqs?.length ? `(${reqs.length})` : ""}</SectionTitle>
      {!reqs?.length ? (
        <Card className="p-5 text-[15px] text-muted">No pending requests.</Card>
      ) : (
        <Card><ul className="divide-y divide-line">
          {reqs.map((q) => {
            const p = byId.get(q.user_id);
            return <RequestRow key={q.id} id={q.id} name={p?.full_name ?? ""} phone={p?.phone ?? null} requested={q.requested_role} message={q.message} when={formatDateTime(q.created_at, tz)} />;
          })}
        </ul></Card>
      )}

      <SectionTitle>Team</SectionTitle>
      {!members?.length ? (
        <EmptyState icon={<Users className="h-6 w-6" aria-hidden />} title="No team yet">Share the joining code above.</EmptyState>
      ) : (
        <Card><ul className="divide-y divide-line">
          {members.map((m) => {
            const p = byId.get(m.user_id);
            return <MemberRow key={m.id} id={m.id} name={p?.full_name ?? ""} phone={p?.phone ?? null} role={m.role} active={m.status === "active"} isSelf={m.user_id === ctx.user.id} isOwner={m.role === "owner"} />;
          })}
        </ul></Card>
      )}
      <p className="mt-4 flex items-start gap-2 text-sm text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> Removing access never deletes a person&apos;s past orders or payments. Every change here is written to the audit log.</p>
    </>
  );
}
