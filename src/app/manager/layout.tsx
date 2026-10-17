import { RoleLayout } from "@/components/RoleLayout";
import { MANAGERS } from "@/lib/session";

export const dynamic = "force-dynamic";

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleLayout roles={MANAGERS} wide>
      {children}
    </RoleLayout>
  );
}
