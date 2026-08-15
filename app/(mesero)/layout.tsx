import type { ReactNode } from "react";

import { requireRole } from "@/modules/auth/guards";

/**
 * Vista de mesero.
 *
 * A diferencia de Caja y Admin, aquí NO se pinta el encabezado común: la app del mesero
 * trae el suyo, con el indicador de sincronización siempre visible.
 *
 * El guard corre en el servidor una sola vez, al entrar. De aquí para adentro la
 * navegación es de cliente para que sobreviva a perder la señal (ver mesero-app.tsx).
 *
 * Caja y Admin también entran: Caja para cubrir una mesa en hora pico, y Admin para
 * poder probar el flujo sin crearse un usuario de mesero.
 */
export default async function MeseroLayout({ children }: { children: ReactNode }) {
  await requireRole(["mesero", "caja", "admin"]);

  return <div className="flex flex-1 flex-col">{children}</div>;
}
