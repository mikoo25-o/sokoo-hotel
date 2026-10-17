import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark";
type Size = "sm" | "md" | "lg";

export function buttonClasses(variant: Variant = "primary", size: Size = "md", block = false) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors",
    "disabled:cursor-not-allowed disabled:opacity-60",
    size === "sm" && "min-h-9 px-3 text-sm",
    size === "md" && "min-h-11 px-4 text-[15px]",
    size === "lg" && "min-h-12 px-5 text-base",
    block && "w-full",
    variant === "primary" && "bg-primary text-white hover:bg-forest active:bg-forest",
    variant === "dark" && "bg-forest text-white hover:bg-primary",
    variant === "secondary" && "border border-line bg-white text-ink hover:bg-canvas",
    variant === "ghost" && "text-primary hover:bg-primary/10",
    variant === "danger" && "bg-danger text-white hover:bg-danger/90",
  );
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export function Button({ variant, size, block, className, type = "button", ...rest }: Props) {
  return <button type={type} className={cn(buttonClasses(variant, size, block), className)} {...rest} />;
}

export function LinkButton({
  href,
  variant,
  size,
  block,
  className,
  children,
  prefetch,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  block?: boolean;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
}) {
  return (
    <Link href={href} prefetch={prefetch} className={cn(buttonClasses(variant, size, block), className)}>
      {children}
    </Link>
  );
}
