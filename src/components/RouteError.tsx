"use client";
import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Friendly recovery screen for a failed page. The raw error is never shown to the person. */
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  return (
    <div role="alert" className="mx-auto mt-10 flex max-w-sm flex-col items-center text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 text-danger">
        <TriangleAlert className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="mt-4 font-display text-xl font-semibold text-ink">{offline ? "You are offline" : "That did not load"}</h1>
      <p className="mt-1.5 text-[15px] text-muted">
        {offline ? "Reconnect to the internet and try again. Nothing was lost." : "Something went wrong on our side. Your data is safe. Try again in a moment."}
      </p>
      <Button className="mt-5" onClick={reset}>
        <RefreshCw className="h-4 w-4" aria-hidden /> Try again
      </Button>
    </div>
  );
}
