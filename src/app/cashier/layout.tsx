import { RoleLayout } from "@/components/RoleLayout";
import { CASHIER_ACCESS } from "@/lib/session";

export const dynamic = "force-dynamic";

export default function CashierLayout({ children }: { children: React.ReactNode }) {
  return <RoleLayout roles={CASHIER_ACCESS}>{children}</RoleLayout>;
}
