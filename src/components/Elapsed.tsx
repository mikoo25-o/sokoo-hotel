"use client";
import { useEffect, useState } from "react";
import { elapsed } from "@/lib/dates";

/** Time since an order was placed, refreshed every 30 seconds. */
export function Elapsed({ since, className }: { since: string; className?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((v) => v + 1), 30000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className={className} suppressHydrationWarning>
      {elapsed(since)}
    </span>
  );
}
