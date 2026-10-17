import { WifiOff } from "lucide-react";
import { Logo } from "@/components/Logo";
import { AutoReload } from "@/components/AutoReload";
import { RetryButton } from "@/components/RetryButton";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <Logo variant="mark" className="h-16 w-16" />
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky text-skyd">
        <WifiOff className="h-6 w-6" aria-hidden />
      </div>
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">You are offline</h1>
        <p className="mx-auto mt-2 max-w-sm text-muted">
          This page was not opened on this phone before, so it cannot be shown without internet. Screens you have already visited stay readable. This page reloads by itself when you are back online.
        </p>
      </div>
      <RetryButton />
      <AutoReload />
    </main>
  );
}
