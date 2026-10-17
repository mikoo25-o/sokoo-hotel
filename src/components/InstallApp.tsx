"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Download, Share } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Lets people install SokoHotel to their home screen. Chrome and Edge on
 * Android and desktop show the real install prompt. iPhone and iPad have no
 * install prompt, so the steps are explained instead.
 */
export function InstallApp({ compact = false }: { compact?: boolean }) {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <p className="flex items-center gap-2 text-sm text-ok">
        <CheckCircle2 className="h-4 w-4" aria-hidden /> SokoHotel is installed on this device.
      </p>
    );
  }
  if (event) {
    return (
      <Button
        variant={compact ? "ghost" : "secondary"}
        onClick={async () => {
          await event.prompt();
          const choice = await event.userChoice;
          if (choice.outcome === "accepted") setInstalled(true);
          setEvent(null);
        }}
      >
        <Download className="h-4 w-4" aria-hidden /> Install SokoHotel app
      </Button>
    );
  }
  if (ios) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted">
        <Share className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span>
          To install: tap <strong className="text-ink">Share</strong> in Safari, then <strong className="text-ink">Add to Home Screen</strong>.
        </span>
      </p>
    );
  }
  return (
    <p className="text-sm text-muted">
      To install, open this page in Chrome or Edge and choose <strong className="text-ink">Install app</strong> from the browser menu.
    </p>
  );
}
