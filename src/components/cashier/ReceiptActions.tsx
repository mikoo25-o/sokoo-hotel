"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function ReceiptActions({ shareText, billHref }: { shareText: string; billHref: string }) {
  const [note, setNote] = useState<string | null>(null);

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "SokoHotel receipt", text: shareText });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setNote("Receipt text copied. Paste it into WhatsApp or SMS.");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setNote("Could not share. Use Print instead.");
    }
  };

  return (
    <div className="no-print mt-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" variant="secondary" onClick={() => window.print()}>
          <Printer className="h-5 w-5" aria-hidden /> Print
        </Button>
        <Button size="lg" variant="secondary" onClick={share}>
          <Share2 className="h-5 w-5" aria-hidden /> Share
        </Button>
      </div>
      {note ? (
        <p role="status" className="flex items-center gap-2 text-sm text-ok">
          <Check className="h-4 w-4" aria-hidden /> {note}
        </p>
      ) : null}
      <Link href={billHref} className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary font-semibold text-white hover:bg-forest">
        Back to bill
      </Link>
      <Link href="/cashier" className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-line bg-white font-semibold text-ink hover:bg-canvas">
        Back to all bills
      </Link>
    </div>
  );
}
