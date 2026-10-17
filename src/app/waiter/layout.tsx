import { RoleLayout } from "@/components/RoleLayout";
import { WAITER_ACCESS } from "@/lib/session";

export const dynamic = "force-dynamic";

export default function WaiterLayout({ children }: { children: React.ReactNode }) {
  return <RoleLayout roles={WAITER_ACCESS}>{children}</RoleLayout>;
}
