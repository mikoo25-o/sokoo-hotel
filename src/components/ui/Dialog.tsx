"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Modal built on the native <dialog> element, which gives focus trapping,
 * Escape-to-close and a backdrop for free. On phones it sits at the bottom
 * like a sheet; on larger screens it is centred.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-0 mt-auto w-full max-w-none rounded-t-2xl bg-white p-0 text-ink shadow-raised backdrop:bg-ink/50",
        "sm:m-auto sm:rounded-2xl",
        wide ? "sm:max-w-2xl" : "sm:max-w-md",
      )}
    >
      <div className="flex max-h-[88dvh] flex-col animate-sheet-up">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-canvas">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 pb-safe-b">{open ? children : null}</div>
      </div>
    </dialog>
  );
}
