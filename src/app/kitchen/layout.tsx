import { RoleLayout } from "@/components/RoleLayout";
import { KITCHEN_ACCESS } from "@/lib/session";

export const dynamic = "force-dynamic";

export default function KitchenLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleLayout roles={KITCHEN_ACCESS} wide>
      {children}
    </RoleLayout>
  );
}
