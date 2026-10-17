import { cn } from "@/lib/cn";

export type GlyphName = "waiter" | "kitchen" | "cashier" | "manager" | "team" | "table";

const FILE: Record<GlyphName, string> = {
  waiter: "/icons/role-waiter.png",
  kitchen: "/icons/role-kitchen.png",
  cashier: "/icons/role-cashier.png",
  manager: "/icons/role-manager.png",
  team: "/icons/team.png",
  table: "/icons/table.png",
};

/**
 * The supplied icon artwork, used as a mask so it takes the current text
 * colour (and therefore the palette) instead of staying black.
 */
export function RoleGlyph({ name, className }: { name: GlyphName; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("glyph h-8 w-8", className)}
      style={{ WebkitMaskImage: `url(${FILE[name]})`, maskImage: `url(${FILE[name]})` }}
    />
  );
}
