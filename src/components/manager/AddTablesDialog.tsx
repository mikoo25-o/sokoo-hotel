"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { AddTablesForm } from "@/components/manager/SettingsForms";

/** Lets a manager add tables without leaving the screen they are on. */
export function AddTablesDialog({ label = "Add tables", variant = "secondary" }: { label?: string; variant?: "primary" | "secondary" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden /> {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add tables">
        <AddTablesForm
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </Dialog>
    </>
  );
}
