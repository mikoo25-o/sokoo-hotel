"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, RefreshCw, Share2, UserCheck, UserX, X } from "lucide-react";
import { decideJoinAction, revokeJoinCodeAction, rotateJoinCodeAction, setMemberActiveAction, setMemberRoleAction } from "@/app/actions/manager";
import type { ActionState } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState | null>(null);
  const run = (fn: () => Promise<ActionState>) =>
    start(async () => {
      const r = await fn();
      setMsg(r);
      router.refresh();
    });
  return { pending, msg, run };
}

function Msg({ msg }: { msg: ActionState | null }) {
  if (!msg?.message) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "mt-2 text-sm text-ok" : "mt-2 text-sm text-danger"}>
      {msg.message}
    </p>
  );
}

export function JoinCodeCard({ code, link, qr }: { code: string | null; link: string | null; qr: string | null }) {
  const { pending, msg, run } = useRun();
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"rotate" | "revoke" | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  const share = async () => {
    if (!link) return;
    const text = `Join our restaurant on SokoHotel. Code: ${code}\n${link}`;
    try {
      if (navigator.share) await navigator.share({ title: "Join on SokoHotel", text });
      else await navigator.clipboard.writeText(text);
    } catch {}
  };

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-muted"><KeyRound className="h-4 w-4 text-primary" aria-hidden /> Staff joining code</div>
      {code ? (
        <div className="mt-3 flex flex-wrap items-center gap-5">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR code that opens the joining page with code ${code}`} width={132} height={132} className="rounded-lg border border-line" />
          ) : null}
          <div className="min-w-0">
            <p className="font-mono text-3xl font-semibold tracking-widest text-forest">{code}</p>
            <p className="mt-1 max-w-xs text-sm text-muted">New staff enter this code when they sign up. Each person still needs your approval before they get access.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={copy}>{copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? "Copied" : "Copy"}</Button>
              <Button size="sm" variant="secondary" onClick={share}><Share2 className="h-4 w-4" aria-hidden /> Share link</Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[15px] text-muted">Joining is switched off. Create a code to let staff request access.</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        {confirm ? (
          <>
            <p className="w-full text-sm text-ink">
              {confirm === "rotate" ? "This replaces the current code. Anyone holding the old one can no longer use it." : "This switches joining off until you create a new code."}
            </p>
            <Button size="sm" variant="danger" disabled={pending} onClick={() => { run(confirm === "rotate" ? rotateJoinCodeAction : revokeJoinCodeAction); setConfirm(null); }}>Yes, continue</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          </>
        ) : (
          <>
            {code ? (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setConfirm("rotate")}><RefreshCw className="h-4 w-4" aria-hidden /> New code</Button>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => run(rotateJoinCodeAction)}><RefreshCw className="h-4 w-4" aria-hidden /> Create code</Button>
            )}
            {code ? <Button size="sm" variant="secondary" disabled={pending} onClick={() => setConfirm("revoke")}>Switch off</Button> : null}
          </>
        )}
      </div>
      <Msg msg={msg} />
    </Card>
  );
}

const ROLE_OPTIONS = [
  { value: "waiter", label: "Waiter" },
  { value: "kitchen", label: "Kitchen" },
  { value: "cashier", label: "Cashier" },
  { value: "manager", label: "Manager" },
];

export function RequestRow({ id, name, phone, requested, message, when }: { id: string; name: string; phone: string | null; requested: string | null; message: string | null; when: string }) {
  const { pending, msg, run } = useRun();
  const [role, setRole] = useState(requested ?? "waiter");
  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{name || "New user"}</p>
          <p className="text-sm text-muted">{phone ? `${phone} · ` : ""}asked {requested ? `to be ${requested}` : "to join"} · {when}</p>
          {message ? <p className="mt-1 text-sm text-ink">&ldquo;{message}&rdquo;</p> : null}
        </div>
        <label className="sr-only" htmlFor={`role-${id}`}>Role to give</label>
        <select id={`role-${id}`} value={role} onChange={(e) => setRole(e.target.value)} className="h-10 rounded-xl border border-line bg-white px-2 text-sm">
          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Button size="sm" disabled={pending} onClick={() => run(() => decideJoinAction(id, true, role))}><UserCheck className="h-4 w-4" aria-hidden /> Approve</Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => decideJoinAction(id, false))}><X className="h-4 w-4" aria-hidden /> Decline</Button>
      </div>
      <Msg msg={msg} />
    </li>
  );
}

export function MemberRow({ id, name, phone, role, active, isSelf, isOwner }: { id: string; name: string; phone: string | null; role: string; active: boolean; isSelf: boolean; isOwner: boolean }) {
  const { pending, msg, run } = useRun();
  const locked = isSelf || isOwner;
  return (
    <li className="px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{name || "Unnamed"}{isSelf ? <span className="font-normal text-muted"> (you)</span> : null}</p>
          <p className="text-sm text-muted">{phone ?? "No phone"}{!active ? " · access removed" : ""}</p>
        </div>
        {isOwner ? (
          <span className="rounded-full bg-forest px-3 py-1 text-xs font-semibold text-white">Owner</span>
        ) : (
          <>
            <label className="sr-only" htmlFor={`m-${id}`}>Role for {name}</label>
            <select id={`m-${id}`} defaultValue={role} disabled={locked || pending || !active} onChange={(e) => run(() => setMemberRoleAction(id, e.target.value))} className="h-10 rounded-xl border border-line bg-white px-2 text-sm disabled:bg-canvas">
              {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {!isSelf ? (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => setMemberActiveAction(id, !active))}>
                {active ? <><UserX className="h-4 w-4" aria-hidden /> Remove access</> : <><UserCheck className="h-4 w-4" aria-hidden /> Restore</>}
              </Button>
            ) : null}
          </>
        )}
      </div>
      <Msg msg={msg} />
    </li>
  );
}
