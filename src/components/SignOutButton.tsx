"use client";
import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions/auth";

/** Signs out and wipes the "last seen" page copies this phone kept for offline use. */
export function SignOutButton() {
  return (
    <form
      action={signOut}
      onSubmit={() => {
        try {
          navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" });
        } catch {
          /* nothing to clear */
        }
      }}
    >
      <button type="submit" aria-label="Log out" className="flex h-10 w-10 items-center justify-center rounded-xl text-white/90 hover:bg-white/10">
        <LogOut className="h-5 w-5" aria-hidden />
      </button>
    </form>
  );
}
