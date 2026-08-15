import "server-only";

import type { Database } from "@/lib/db.types";
import { getServerClient } from "@/lib/supabase/server";

export type MenuCategory = Database["public"]["Tables"]["menu_categories"]["Row"];
export type MenuItem = Database["public"]["Tables"]["menu_items"]["Row"];
export type MenuVariant = Database["public"]["Tables"]["menu_item_variants"]["Row"];

export type MenuItemWithVariants = MenuItem & {
  menu_item_variants: MenuVariant[];
};

/**
 * La carta completa para el admin, incluyendo lo dado de baja (necesita verlo para
 * reactivarlo). El mesero usa `get_menu_snapshot()` en su lugar, que trae solo lo
 * activo y en una sola llamada pensada para cachear offline.
 */
export async function listMenuItems(): Promise<MenuItemWithVariants[]> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("menu_items")
    .select(
      "id, name, description, base_price, category_id, sort_order, is_active, created_at, updated_at, menu_item_variants(id, menu_item_id, name, price, sort_order, is_active, created_at)",
    )
    .order("is_active", { ascending: false })
    .order("sort_order")
    .order("sort_order", { referencedTable: "menu_item_variants" });

  if (error) throw new Error(`No se pudo cargar la carta: ${error.message}`);
  return (data ?? []) as MenuItemWithVariants[];
}

export async function listCategories(): Promise<MenuCategory[]> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("menu_categories")
    .select("*")
    .order("is_active", { ascending: false })
    .order("sort_order");

  if (error) throw new Error(`No se pudieron cargar las categorías: ${error.message}`);
  return data ?? [];
}
