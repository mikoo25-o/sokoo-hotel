"use client";
import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/use-online";

/** Appears only when the connection drops. Pages already opened stay readable. */
export function ConnectionBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="no-print flex items-start gap-2 bg-ink px-4 py-2.5 text-sm text-white">
      <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>You are offline. You can read screens you already opened, but new orders, payments and changes need a connection.</span>
    </div>
  );
}
