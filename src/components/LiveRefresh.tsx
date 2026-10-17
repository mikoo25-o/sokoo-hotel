"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio, WifiOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

/**
 * Keeps a page current. It listens to Supabase Realtime for changes to this
 * restaurant's orders (the database applies RLS, so people only receive rows
 * they may see) and also polls, refreshes when the tab becomes visible, and
 * refreshes when the connection returns. Realtime is the fast path. The
 * polling fallback means a dropped socket never leaves a screen stale.
 */
export function LiveRefresh({
  restaurantId,
  intervalMs = 20000,
  showStatus = false,
}: {
  restaurantId: string;
  intervalMs?: number;
  showStatus?: boolean;
}) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const [online, setOnline] = useState(true);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (pending.current) return;
      pending.current = setTimeout(() => {
        pending.current = null;
        router.refresh();
      }, 400);
    };

    const supabase = createClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, refresh)
      .subscribe((status: string) => {
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") refresh(); // catch anything missed while connecting
      });

    const poll = setInterval(() => {
      if (!document.hidden && navigator.onLine) router.refresh();
    }, intervalMs);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    const onOnline = () => {
      setOnline(true);
      refresh();
    };
    const onOffline = () => setOnline(false);
    setOnline(navigator.onLine);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      clearInterval(poll);
      if (pending.current) clearTimeout(pending.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, intervalMs, router]);

  if (!showStatus) return null;
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        !online ? "bg-danger/10 text-danger" : live ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn",
      )}
    >
      {!online ? <WifiOff className="h-3.5 w-3.5" aria-hidden /> : <Radio className="h-3.5 w-3.5" aria-hidden />}
      {!online ? "Offline" : live ? "Live" : "Updating every 20s"}
    </span>
  );
}
