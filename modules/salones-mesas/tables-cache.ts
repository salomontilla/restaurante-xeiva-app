import { getBrowserClient } from "@/lib/supabase/browser";
import { isNetworkError, reportReachable, reportUnreachable } from "@/modules/offline/connection";
import { db, type CachedTable } from "@/modules/offline/db";

/**
 * Mesas cacheadas en el celular.
 *
 * Sale de la vista `v_table_map`, la misma que usa Caja: una fila por mesa activa con el
 * pedido abierto ya resuelto. "Ocupada" no es una columna, es `open_order_id != null`.
 *
 * El mesero necesita esto en caché para poder ver el salón sin señal. Lo que NO puede
 * hacer sin señal es TOMAR una mesa: dos meseros offline no pueden resolver entre sí
 * quién se quedó con la mesa 5.
 */
export async function refreshTablesCache(): Promise<CachedTable[]> {
  try {
    const { data, error } = await getBrowserClient()
      .from("v_table_map")
      .select(
        "table_id, table_label, seats, sort_order, dining_room_id, dining_room_name, dining_room_sort_order, assigned_waiter_id, assigned_waiter_name, open_order_id, open_order_total",
      );

    if (error) {
      if (isNetworkError(error)) reportUnreachable();
      return db.myTables.toArray();
    }

    reportReachable();

    const cachedAt = new Date().toISOString();
    const rows: CachedTable[] = (data ?? []).map((row) => ({
      tableId: row.table_id!,
      tableLabel: row.table_label!,
      seats: row.seats,
      sortOrder: row.sort_order ?? 0,
      roomId: row.dining_room_id!,
      roomName: row.dining_room_name!,
      roomSortOrder: row.dining_room_sort_order ?? 0,
      assignedWaiterId: row.assigned_waiter_id,
      assignedWaiterName: row.assigned_waiter_name,
      openOrderId: row.open_order_id,
      openOrderTotal: row.open_order_total,
      cachedAt,
    }));

    // Se reemplaza el set completo: una mesa que el admin dio de baja debe desaparecer
    // del celular, no quedarse porque nadie la volvió a nombrar.
    await db.transaction("rw", db.myTables, async () => {
      await db.myTables.clear();
      await db.myTables.bulkPut(rows);
    });

    return rows;
  } catch (error) {
    if (isNetworkError(error)) reportUnreachable();
    return db.myTables.toArray();
  }
}
