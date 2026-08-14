import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { requireRole } from "@/modules/auth/guards";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole(["admin"]);

  return (
    <>
      <AppHeader
        profile={profile}
        nav={[
          { href: "/admin", label: "Inicio" },
          { href: "/admin/salones", label: "Salones y mesas" },
          { href: "/admin/menu", label: "Carta" },
          { href: "/admin/usuarios", label: "Meseros" },
          { href: "/admin/ventas", label: "Ventas" },
          { href: "/caja", label: "Caja" },
        ]}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 p-4">{children}</main>
    </>
  );
}
