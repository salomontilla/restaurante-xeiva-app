import { getBrowserClient } from "@/lib/supabase/browser";
import { isNetworkError, reportReachable, reportUnreachable } from "@/modules/offline/connection";

import { refreshTablesCache } from "./tables-cache";

export type ClaimResult =
  | { ok: true }
  | { ok: false; code: "TABLE_TAKEN" | "NOT_FOUND" | "FORBIDDEN" | "OFFLINE" | "ERROR"; message: string };

/**
 * El mesero toma una mesa libre.
 *
 * Es la ÚNICA acción del mesero que EXIGE conexión, y hay que ser explícito sobre por
 * qué: dos meseros sin señal no pueden resolver entre ellos quién se quedó con la mesa 5.
 * Si se permitiera offline, ambos creerían tenerla y uno perdería su pedido al
 * sincronizar.
 *
 * Todo lo demás —agregar platos a una mesa que ya es suya, enviar, consultar la carta—
 * sí funciona sin señal.
 */
export async function claimTable(tableId: string): Promise<ClaimResult> {
  try {
    const { data, error } = await getBrowserClient().rpc("claim_table", { p_table_id: tableId });

    if (error) {
      if (isNetworkError(error)) {
        reportUnreachable();
        return { ok: false, code: "OFFLINE", message: "Sin conexión: no puedes tomar mesas nuevas." };
      }
      return { ok: false, code: "ERROR", message: error.message };
    }

    reportReachable();

    const result = data as { ok: boolean; code: string | null } | null;

    if (!result?.ok) {
      const code = (result?.code ?? "ERROR") as "TABLE_TAKEN" | "NOT_FOUND" | "FORBIDDEN";
      const messages: Record<string, string> = {
        TABLE_TAKEN: "Otro mesero tomó esta mesa primero.",
        NOT_FOUND: "Esta mesa ya no existe.",
        FORBIDDEN: "No tienes permiso para tomar mesas.",
      };
      // Refrescar deja el celular viendo quién la tiene ahora, no un estado viejo.
      await refreshTablesCache();
      return { ok: false, code, message: messages[code] ?? "No se pudo tomar la mesa." };
    }

    await refreshTablesCache();
    return { ok: true };
  } catch (error) {
    if (isNetworkError(error)) {
      reportUnreachable();
      return { ok: false, code: "OFFLINE", message: "Sin conexión: no puedes tomar mesas nuevas." };
    }
    return { ok: false, code: "ERROR", message: "No se pudo tomar la mesa." };
  }
}
