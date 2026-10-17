"use client";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { addStarterDataAction } from "@/app/actions/manager";
import { useOnline } from "@/lib/use-online";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function StarterData() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const online = useOnline();
  return (
    <Card tone="sky" className="mb-5 p-5">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-skyd" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-semibold text-ink">Want to start quickly?</h2>
          <p className="text-sm text-skyink">Add a sample Kenyan menu (ugali, pilau, chai, soda and more) and 8 tables. It is only a starting point: rename items and change prices to match you. It creates no orders and no sales.</p>
          <Button className="mt-3" disabled={pending || !online} onClick={() => start(async () => { const r = await addStarterDataAction(); setMsg({ ok: r.ok, text: r.message ?? (r.ok ? "Done." : "Something went wrong.") }); })}>
            {pending ? "Adding…" : "Add sample menu and tables"}
          </Button>
          {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "mt-2 text-sm text-ok" : "mt-2 text-sm text-danger"}>{msg.text}</p> : null}
        </div>
      </div>
    </Card>
  );
}
