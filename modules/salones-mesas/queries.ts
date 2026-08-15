import "server-only";

import type { Database } from "@/lib/db.types";
import { getServerClient } from "@/lib/supabase/server";

export type DiningRoom = Database["public"]["Tables"]["dining_rooms"]["Row"];
export type RestaurantTable = Database["public"]["Tables"]["tables"]["Row"];

export type RoomWithTables = DiningRoom & {
  tables: Pick<
    RestaurantTable,
    "id" | "label" | "seats" | "sort_order" | "is_active" | "assigned_waiter_id"
  >[];
};

/**
 * Salones con sus mesas, para la pantalla de administración.
 *
 * Trae también los inactivos: el admin necesita verlos para reactivarlos. Las demás
 * vistas (mesero, caja) filtran por `is_active` en sus propias consultas.
 */
export async function listRoomsWithTables(): Promise<RoomWithTables[]> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("dining_rooms")
    // El select va como literal de una sola pieza a propósito: concatenarlo rompe la
    // inferencia de tipos de supabase-js y el resultado deja de estar tipado.
    .select(
      "id, name, sort_order, is_active, created_at, tables(id, label, seats, sort_order, is_active, assigned_waiter_id)",
    )
    .order("is_active", { ascending: false })
    .order("sort_order")
    .order("sort_order", { referencedTable: "tables" });

  if (error) throw new Error(`No se pudieron cargar los salones: ${error.message}`);
  return (data ?? []) as RoomWithTables[];
}
