/**
 * Forma de la carta tal como la devuelve `get_menu_snapshot()`.
 *
 * Es estructural a propósito: `CachedMenu` (el de IndexedDB, en modules/offline/db.ts)
 * encaja aquí sin conversión, y lo mismo el resultado del RPC leído desde Caja. Así el
 * selector de platos es UNO solo para las dos vistas.
 */

export type MenuVariantOption = {
  id: string;
  name: string;
  price: number;
};

export type MenuItemOption = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  base_price: number;
  sort_order: number;
  variants: MenuVariantOption[];
};

export type MenuCategoryOption = {
  id: string;
  name: string;
  sort_order: number;
};

export type MenuSnapshot = {
  version: string;
  categories: MenuCategoryOption[];
  items: MenuItemOption[];
};

/** Lo que se elige al tocar un plato. `variant` en null = porción normal. */
export type MenuPick = {
  item: MenuItemOption;
  variant: MenuVariantOption | null;
  /** Precio que corresponde: el de la variante, o el base del plato. */
  unitPrice: number;
};
