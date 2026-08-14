import type { ReactNode } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { requireRole } from "@/modules/auth/guards";

/**
 * Vista de mesero.
 *
 * El guard corre en el servidor UNA vez, al entrar. De aquí para adentro todo debe ser
 * cliente: cuando se agregue la capa offline (Fase 4), la navegación dentro de /mesero
 * no puede depender de que el servidor de Next responda, porque el celular pierde señal
 * a mitad de un pedido. Ver docs/architecture.md → Decisiones de frontend.
 *
 * Caja y Admin también entran aquí: Caja para cubrir una mesa en hora pico, y Admin
 * para poder probar el flujo sin crearse un usuario de mesero.
 */
export default async function MeseroLayout({ children }: { children: ReactNode }) {
  const profile = await requireRole(["mesero", "caja", "admin"]);

  return (
    <>
      <AppHeader profile={profile} />
      <main className="flex-1 pb-24">{children}</main>
    </>
  );
}
