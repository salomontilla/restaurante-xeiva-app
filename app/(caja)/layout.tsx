import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { requireRole } from "@/modules/auth/guards";

export default async function CajaLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole(["caja", "admin"]);

  return (
    <>
      <AppHeader
        profile={profile}
        nav={[
          { href: "/caja", label: "Mesas" },
          { href: "/caja/arqueo", label: "Arqueo" },
          { href: "/mesero", label: "Tomar pedido" },
        ]}
      />
      <main className="flex-1">{children}</main>
    </>
  );
}
