import type { ReactNode } from "react";

import { requireRole } from "@/modules/auth/guards";

/**
 * Layout de las vistas de impresión (comandas y recibos).
 *
 * Va en su propio route group para quedar SIN el encabezado de la app: lo que se manda
 * a la impresora tiene que ser la hoja y nada más. Es mucho más simple una ruta limpia
 * que esconder el resto de la interfaz con `display: none` desde `@media print`.
 */
export default async function PrintLayout({ children }: { children: ReactNode }) {
  await requireRole(["caja", "admin"]);

  return <div className="flex flex-1 flex-col">{children}</div>;
}
