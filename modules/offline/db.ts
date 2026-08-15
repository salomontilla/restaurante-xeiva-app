import Dexie, { type EntityTable } from "dexie";

/**
 * Base local del mesero (IndexedDB vía Dexie).
 *
 * La idea que ordena toda la vista de mesero: ESTA base es la fuente de render, no el
 * servidor. Ningún componente hace `await supabase…` y muestra un spinner — se escribe
 * aquí, `useLiveQuery` re-renderiza al instante, y el sync engine se encarga del resto
 * cuando haya señal. Eso elimina de raíz la categoría entera de bugs "se fue la señal a
 * mitad del pedido", porque no existe un momento en que el pedido viva solo en memoria.
 *
 * Cuatro stores, cada uno con una razón distinta de existir:
 *   menu      · la carta cacheada, para poder pedir sin conexión
 *   myTables  · las mesas cacheadas, para poder ver el salón sin conexión
 *   drafts    · lo que el mesero lleva escrito de cada mesa  ← lo crítico
 *   outbox    · los envíos pendientes de confirmar
 */

/** Una línea tal como la escribió el mesero. */
export type DraftItem = {
  /** uuid v7 generado en el celular ANTES de tocar la red. Es la clave de idempotencia. */
  id: string;
  menuItemId: string;
  variantId: string | null;
  /** Nombre y precio son solo para pintar: el servidor los resuelve y congela él mismo. */
  itemName: string;
  variantName: string | null;
  unitPrice: number;
  qty: number;
  note: string | null;
  clientCreatedAt: string;
  /** null mientras el servidor no la haya confirmado. */
  syncedAt: string | null;
  /** true si la línea vino del servidor (por ejemplo, la agregó Caja). */
  fromServer?: boolean;
  /** El servidor ya la mandó a Cocina: no se puede borrar desde el celular. */
  printedAt?: string | null;
};

export type Draft = {
  /** uuid v7 del pedido, generado en el cliente al abrir la mesa. */
  orderId: string;
  tableId: string;
  tableLabel: string;
  roomName: string;
  items: DraftItem[];
  updatedAt: string;
  /** Se marca cuando el servidor confirma que el pedido quedó cerrado y pagado. */
  closed?: boolean;
};

export type OutboxStatus = "pending" | "conflict";

export type OutboxOp = {
  opId: string;
  orderId: string;
  tableId: string;
  tableLabel: string;
  /** Payload exacto de `submit_order`. Se guarda armado para no depender del draft. */
  payload: SubmitOrderPayload;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  /** Código de negocio devuelto por el RPC cuando quedó en conflicto. */
  conflictCode: string | null;
  createdAt: string;
};

export type SubmitOrderPayload = {
  id: string;
  table_id: string;
  client_created_at: string;
  note?: string | null;
  items: {
    id: string;
    menu_item_id: string;
    variant_id: string | null;
    qty: number;
    note: string | null;
    client_created_at: string;
  }[];
};

export type CachedMenu = {
  key: "current";
  version: string;
  categories: { id: string; name: string; sort_order: number }[];
  items: {
    id: string;
    category_id: string | null;
    name: string;
    description: string | null;
    base_price: number;
    sort_order: number;
    variants: { id: string; name: string; price: number }[];
  }[];
  cachedAt: string;
};

export type CachedTable = {
  tableId: string;
  tableLabel: string;
  seats: number | null;
  sortOrder: number;
  roomId: string;
  roomName: string;
  roomSortOrder: number;
  assignedWaiterId: string | null;
  assignedWaiterName: string | null;
  openOrderId: string | null;
  openOrderTotal: number | null;
  cachedAt: string;
};

const db = new Dexie("xeiva-mesero") as Dexie & {
  menu: EntityTable<CachedMenu, "key">;
  myTables: EntityTable<CachedTable, "tableId">;
  drafts: EntityTable<Draft, "orderId">;
  outbox: EntityTable<OutboxOp, "opId">;
};

db.version(1).stores({
  menu: "key",
  // NO se puede llamar `tables`: Dexie ya usa `db.tables` para su propia lista de
  // stores, y el store quedaría tapado por esa propiedad.
  myTables: "tableId, roomId, assignedWaiterId",
  // `tableId` indexado: la pantalla de la mesa busca su borrador por mesa, no por pedido.
  drafts: "orderId, tableId, updatedAt",
  // `createdAt` indexado: el outbox se vacía en orden FIFO estricto.
  outbox: "opId, status, createdAt",
});

export { db };

/**
 * Borra todo lo local. Se llama al cerrar sesión: el celular puede pasar de un mesero a
 * otro entre turnos y los borradores de uno no pueden aparecerle al siguiente.
 */
export async function clearLocalData() {
  await Promise.all([db.menu.clear(), db.myTables.clear(), db.drafts.clear(), db.outbox.clear()]);
}
