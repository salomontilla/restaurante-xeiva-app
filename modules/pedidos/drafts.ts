import { v7 as uuidv7 } from "uuid";

import { getBrowserClient } from "@/lib/supabase/browser";
import { isNetworkError, reportReachable, reportUnreachable } from "@/modules/offline/connection";
import { db, type CachedTable, type Draft, type DraftItem } from "@/modules/offline/db";
import { enqueueDraft } from "@/modules/offline/outbox";
import { requestFlush } from "@/modules/offline/sync-engine";

/**
 * Borradores: lo que el mesero lleva escrito de cada mesa.
 *
 * TODO se persiste en el momento de la interacción, no al enviar. Un plato agregado ya
 * está en IndexedDB antes de que el mesero levante el dedo. Si el celular se queda sin
 * batería a mitad del pedido, al volver está todo.
 */

export async function getDraftByTable(tableId: string): Promise<Draft | undefined> {
  const drafts = await db.drafts.where("tableId").equals(tableId).toArray();
  return drafts.find((draft) => !draft.closed);
}

/**
 * Abre (o recupera) el borrador de una mesa.
 *
 * Si el servidor ya tenía un pedido abierto en esa mesa, se reusa SU id para que
 * `submit_order` agregue líneas en vez de intentar crear otro pedido. Si no, se genera
 * un uuid v7 aquí mismo, en el celular, antes de cualquier llamada — que es lo que hace
 * idempotente todo el flujo.
 */
export async function openDraft(table: CachedTable): Promise<Draft> {
  const existing = await getDraftByTable(table.tableId);
  if (existing) return existing;

  const draft: Draft = {
    orderId: table.openOrderId ?? uuidv7(),
    tableId: table.tableId,
    tableLabel: table.tableLabel,
    roomName: table.roomName,
    items: [],
    updatedAt: new Date().toISOString(),
  };

  await db.drafts.put(draft);
  return draft;
}

async function mutate(orderId: string, fn: (draft: Draft) => Draft): Promise<void> {
  await db.transaction("rw", db.drafts, async () => {
    const draft = await db.drafts.get(orderId);
    if (!draft) return;
    await db.drafts.put({ ...fn(draft), updatedAt: new Date().toISOString() });
  });
}

export async function addItem(
  orderId: string,
  item: {
    menuItemId: string;
    variantId: string | null;
    itemName: string;
    variantName: string | null;
    unitPrice: number;
    qty?: number;
    note?: string | null;
  },
): Promise<void> {
  const newItem: DraftItem = {
    // El id se genera AQUÍ, antes de tocar la red. Reenviar el mismo pedido choca contra
    // esta PK en Postgres y no duplica nada.
    id: uuidv7(),
    menuItemId: item.menuItemId,
    variantId: item.variantId,
    itemName: item.itemName,
    variantName: item.variantName,
    unitPrice: item.unitPrice,
    qty: item.qty ?? 1,
    note: item.note ?? null,
    clientCreatedAt: new Date().toISOString(),
    syncedAt: null,
  };

  await mutate(orderId, (draft) => ({ ...draft, items: [...draft.items, newItem] }));
}

/**
 * Cambiar cantidad solo tiene sentido antes de enviar. Una vez confirmada, la línea es
 * del servidor: ajustarla es cosa de Caja, que sí tiene permiso.
 */
export async function changeQty(orderId: string, itemId: string, qty: number): Promise<void> {
  if (qty < 1) return removeItem(orderId, itemId);

  await mutate(orderId, (draft) => ({
    ...draft,
    items: draft.items.map((item) =>
      item.id === itemId && item.syncedAt === null ? { ...item, qty } : item,
    ),
  }));
}

export async function removeItem(orderId: string, itemId: string): Promise<void> {
  await mutate(orderId, (draft) => ({
    ...draft,
    items: draft.items.filter((item) => !(item.id === itemId && item.syncedAt === null)),
  }));
}

export async function setItemNote(
  orderId: string,
  itemId: string,
  note: string | null,
): Promise<void> {
  await mutate(orderId, (draft) => ({
    ...draft,
    items: draft.items.map((item) =>
      item.id === itemId && item.syncedAt === null ? { ...item, note } : item,
    ),
  }));
}

/**
 * Encola el envío y pide un flush inmediato.
 *
 * Devuelve enseguida: la UI confirma sin esperar a la red. Si hay señal, el envío pasa
 * en milisegundos; si no, queda en la cola y el mesero ve "N pendientes".
 */
export async function sendDraft(orderId: string): Promise<{ queued: boolean }> {
  const draft = await db.drafts.get(orderId);
  if (!draft) return { queued: false };

  const op = await enqueueDraft(draft);
  if (op) requestFlush();

  return { queued: op !== null };
}

export function pendingItems(draft: Draft): DraftItem[] {
  return draft.items.filter((item) => item.syncedAt === null);
}

export function draftTotal(draft: Draft): number {
  return draft.items.reduce((total, item) => total + item.unitPrice * item.qty, 0);
}

/**
 * Trae del servidor las líneas del pedido y las fusiona con el borrador local.
 *
 * Hace falta porque Caja también agrega platos y anula líneas sobre la misma mesa: sin
 * esto, el mesero vería solo lo que él escribió. La fusión es por id, así que una línea
 * que el mesero envió y el servidor confirmó no se duplica.
 *
 * El borrador local manda sobre las líneas que aún no se han enviado; el servidor manda
 * sobre todo lo demás.
 */
export async function syncOrderFromServer(orderId: string): Promise<void> {
  try {
    const supabase = getBrowserClient();

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) {
      if (isNetworkError(orderError)) reportUnreachable();
      return;
    }
    reportReachable();

    // El pedido no existe todavía en el servidor (el mesero lo tomó sin señal).
    if (!order) return;

    if (order.status === "cerrado" || order.status === "anulado") {
      await mutate(orderId, (draft) => ({ ...draft, closed: true }));
      return;
    }

    const { data: rows, error } = await supabase
      .from("order_items")
      .select("id, menu_item_id, variant_id, qty, unit_price, item_name, variant_name, note, client_created_at, printed_at, voided_at")
      .eq("order_id", orderId)
      .is("voided_at", null);

    if (error) return;

    const serverItems: DraftItem[] = (rows ?? []).map((row) => ({
      id: row.id,
      menuItemId: row.menu_item_id,
      variantId: row.variant_id,
      itemName: row.item_name,
      variantName: row.variant_name,
      unitPrice: Number(row.unit_price),
      qty: row.qty,
      note: row.note,
      clientCreatedAt: row.client_created_at,
      syncedAt: row.client_created_at,
      fromServer: true,
      printedAt: row.printed_at,
    }));

    const serverIds = new Set(serverItems.map((item) => item.id));

    await mutate(orderId, (draft) => ({
      ...draft,
      items: [
        ...serverItems,
        // Lo que el mesero escribió y el servidor todavía no conoce. Si una línea ya
        // está confirmada y el servidor NO la trae, es porque Caja la anuló: se cae del
        // borrador, que es justo lo que debe pasar.
        ...draft.items.filter((item) => item.syncedAt === null && !serverIds.has(item.id)),
      ],
    }));
  } catch (error) {
    if (isNetworkError(error)) reportUnreachable();
  }
}
