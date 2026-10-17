import Link from "next/link";
import { Compass } from "lucide-react";
import { Logo } from "@/components/Logo";
import { LinkButton } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <Logo variant="mark" className="h-16 w-16" />
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sky text-skyd">
        <Compass className="h-6 w-6" aria-hidden />
      </span>
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Page not found</h1>
        <p className="mx-auto mt-2 max-w-sm text-muted">That page does not exist, or you do not have access to it.</p>
      </div>
      <LinkButton href="/">Go home</LinkButton>
      <Link href="/login" className="text-sm font-semibold text-primary underline underline-offset-4">Sign in</Link>
    </main>
  );
}
