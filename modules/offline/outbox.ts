import { v7 as uuidv7 } from "uuid";

import { db, type Draft, type OutboxOp, type SubmitOrderPayload } from "./db";

/**
 * Cola de salida. Una sola operación: `submit_order`.
 *
 * Que la cola sea homogénea no es casualidad: `submit_order` sirve tanto para "tomé el
 * pedido" como para "agregué dos cervezas", porque si el pedido ya existe la cabecera se
 * ignora y solo entran las líneas nuevas. Con un único tipo de operación, reintentar en
 * orden es trivial y no hay que razonar sobre dependencias entre ops.
 */

/**
 * Encola las líneas que todavía no ha confirmado el servidor.
 * Devuelve null si no había nada que enviar.
 */
export async function enqueueDraft(draft: Draft): Promise<OutboxOp | null> {
  const pendingItems = draft.items.filter((item) => item.syncedAt === null && !item.fromServer);
  if (pendingItems.length === 0) return null;

  const payload: SubmitOrderPayload = {
    id: draft.orderId,
    table_id: draft.tableId,
    client_created_at: draft.items[0]?.clientCreatedAt ?? new Date().toISOString(),
    items: pendingItems.map((item) => ({
      id: item.id,
      menu_item_id: item.menuItemId,
      variant_id: item.variantId,
      qty: item.qty,
      note: item.note,
      client_created_at: item.clientCreatedAt,
    })),
  };

  const op: OutboxOp = {
    opId: uuidv7(),
    orderId: draft.orderId,
    tableId: draft.tableId,
    tableLabel: draft.tableLabel,
    payload,
    status: "pending",
    attempts: 0,
    lastError: null,
    conflictCode: null,
    createdAt: new Date().toISOString(),
  };

  await db.outbox.add(op);
  return op;
}

/** La siguiente operación a enviar, en orden estricto de creación. */
export async function nextPendingOp(): Promise<OutboxOp | undefined> {
  return db.outbox.where("status").equals("pending").sortBy("createdAt").then((ops) => ops[0]);
}

export async function countPending(): Promise<number> {
  return db.outbox.where("status").equals("pending").count();
}

export async function countConflicts(): Promise<number> {
  return db.outbox.where("status").equals("conflict").count();
}

/**
 * El servidor aceptó la operación: se retira de la cola y las líneas quedan marcadas
 * como confirmadas.
 */
export async function markOpDone(op: OutboxOp): Promise<void> {
  const syncedAt = new Date().toISOString();
  const sentIds = new Set(op.payload.items.map((item) => item.id));

  await db.transaction("rw", db.outbox, db.drafts, async () => {
    await db.outbox.delete(op.opId);

    const draft = await db.drafts.get(op.orderId);
    if (!draft) return;

    await db.drafts.put({
      ...draft,
      items: draft.items.map((item) =>
        sentIds.has(item.id) && item.syncedAt === null ? { ...item, syncedAt } : item,
      ),
      updatedAt: syncedAt,
    });
  });
}

/**
 * El servidor rechazó la operación por una razón de NEGOCIO (la mesa ya se cerró, otro
 * mesero la tomó). Reintentar no va a cambiar nada: se saca de la cola de pendientes y
 * se le muestra al mesero para que decida.
 */
export async function markOpConflict(op: OutboxOp, code: string, message: string): Promise<void> {
  await db.outbox.update(op.opId, {
    status: "conflict",
    conflictCode: code,
    lastError: message,
    attempts: op.attempts + 1,
  });
}

/** Falló por red. Sigue pendiente; solo se cuenta el intento. */
export async function markOpRetry(op: OutboxOp, message: string): Promise<void> {
  await db.outbox.update(op.opId, { attempts: op.attempts + 1, lastError: message });
}

export async function discardOp(opId: string): Promise<void> {
  await db.outbox.delete(opId);
}

/**
 * Reencola un conflicto contra el pedido que el servidor sí reconoce.
 *
 * Es el caso "la mesa ya tenía otro pedido abierto": las líneas conservan su uuid, así
 * que reenviarlas contra el otro `order_id` sigue siendo idempotente.
 */
export async function retargetOp(opId: string, newOrderId: string): Promise<void> {
  const op = await db.outbox.get(opId);
  if (!op) return;

  await db.outbox.update(opId, {
    status: "pending",
    conflictCode: null,
    lastError: null,
    attempts: 0,
    orderId: newOrderId,
    payload: { ...op.payload, id: newOrderId },
  });
}
