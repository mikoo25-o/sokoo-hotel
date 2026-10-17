import Image from "next/image";
import { cn } from "@/lib/cn";

type Variant = "full" | "mark" | "wordmark";

const SRC: Record<Variant, { colour: string; white: string; w: number; h: number }> = {
  full: { colour: "/brand/logo-full.png", white: "/brand/logo-full-white.png", w: 900, h: 772 },
  mark: { colour: "/brand/logo-mark.png", white: "/brand/logo-mark-white.png", w: 512, h: 513 },
  wordmark: { colour: "/brand/logo-wordmark.png", white: "/brand/logo-wordmark-white.png", w: 720, h: 170 },
};

/** The supplied SokoHotel artwork. `white` is the single-colour version for dark backgrounds. */
export function Logo({
  variant = "full",
  white = false,
  className,
  priority = false,
}: {
  variant?: Variant;
  white?: boolean;
  className?: string;
  priority?: boolean;
}) {
  const s = SRC[variant];
  return (
    <Image
      src={white ? s.white : s.colour}
      width={s.w}
      height={s.h}
      alt="SokoHotel, Smarter Restaurant Operations"
      priority={priority}
      sizes="(max-width: 640px) 60vw, 320px"
      className={cn("select-none object-contain", className)}
    />
  );
}
