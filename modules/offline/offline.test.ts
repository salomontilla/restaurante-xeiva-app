import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Pruebas de la capa offline — la parte de más riesgo del proyecto.
 *
 * Se ejercita la lógica REAL sobre Dexie (con IndexedDB de mentira en Node), y se
 * simula únicamente la respuesta de Supabase. Lo que se comprueba es exactamente lo que
 * CLAUDE.md exige: que perder la señal a mitad de un pedido no rompa nada y que
 * reintentar no duplique.
 */

// El cliente de Supabase se simula: lo que se prueba es el motor, no la red.
const rpc = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  getBrowserClient: () => ({ rpc }),
}));

const { db } = await import("./db");
const { addItem, openDraft, sendDraft, draftTotal, changeQty } = await import(
  "@/modules/pedidos/drafts"
);
const { flush } = await import("./sync-engine");
const { countPending, countConflicts } = await import("./outbox");
const { getConnectionStatus } = await import("./connection");

const TABLE = {
  tableId: "table-1",
  tableLabel: "5",
  seats: 4,
  sortOrder: 1,
  roomId: "room-1",
  roomName: "Mango",
  roomSortOrder: 1,
  assignedWaiterId: "waiter-1",
  assignedWaiterName: "Juan",
  openOrderId: null,
  openOrderTotal: null,
  cachedAt: new Date().toISOString(),
};

const BANDEJA = {
  menuItemId: "item-1",
  variantId: null,
  itemName: "Bandeja Paisa",
  variantName: null,
  unitPrice: 38000,
};

async function reset() {
  await Promise.all([db.drafts.clear(), db.outbox.clear(), db.myTables.clear(), db.menu.clear()]);
  rpc.mockReset();
}

/** Simula un corte de WiFi: `fetch` no logra salir. */
function networkDown() {
  rpc.mockRejectedValue(new TypeError("Failed to fetch"));
}

function serverAccepts() {
  rpc.mockResolvedValue({ data: { ok: true, code: null }, error: null });
}

function serverRejects(code: string, extra: Record<string, unknown> = {}) {
  rpc.mockResolvedValue({ data: { ok: false, code, ...extra }, error: null });
}

beforeEach(reset);

describe("borradores", () => {
  test("el pedido se guarda apenas se toca, sin esperar a la red", async () => {
    const draft = await openDraft(TABLE);
    await addItem(draft.orderId, BANDEJA);
    await addItem(draft.orderId, { ...BANDEJA, itemName: "Gaseosa", unitPrice: 5000 });

    // Se relee desde IndexedDB, no desde memoria: es lo que sobreviviría a que el
    // celular se quede sin batería.
    const stored = await db.drafts.get(draft.orderId);
    expect(stored?.items).toHaveLength(2);
    expect(draftTotal(stored!)).toBe(43000);
    expect(rpc).not.toHaveBeenCalled();
  });

  test("cada línea nace con su propio id, generado en el celular", async () => {
    const draft = await openDraft(TABLE);
    await addItem(draft.orderId, BANDEJA);
    await addItem(draft.orderId, BANDEJA);

    const stored = await db.drafts.get(draft.orderId);
    const ids = stored!.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => id.length === 36)).toBe(true);
  });

  test("reusa el pedido que el servidor ya tenía abierto en la mesa", async () => {
    const draft = await openDraft({ ...TABLE, openOrderId: "pedido-del-servidor" });
    expect(draft.orderId).toBe("pedido-del-servidor");
  });
});

describe("envío sin señal", () => {
  test("EL CASO CRÍTICO: se va la señal a mitad del pedido y no se pierde nada", async () => {
    const draft = await openDraft(TABLE);
    await addItem(draft.orderId, BANDEJA);

    networkDown();
    await sendDraft(draft.orderId);
    await flush();

    // Queda en la cola, la línea sigue sin confirmar, y el estado pasa a offline.
    expect(await countPending()).toBe(1);
    expect(getConnectionStatus()).toBe("offline");
    const offline = await db.drafts.get(draft.orderId);
    expect(offline!.items[0].syncedAt).toBeNull();

    // Vuelve la señal.
    serverAccepts();
    await flush();

    expect(await countPending()).toBe(0);
    expect(getConnectionStatus()).toBe("online");
    const online = await db.drafts.get(draft.orderId);
    expect(online!.items[0].syncedAt).not.toBeNull();
  });

  test("reenviar el mismo pedido no vuelve a mandar lo ya confirmado", async () => {
    const draft = await openDraft(TABLE);
    await addItem(draft.orderId, BANDEJA);

    serverAccepts();
    await sendDraft(draft.orderId);
    await flush();

    // Segundo "Enviar" sin nada nuevo: no debe encolar nada.
    const second = await sendDraft(draft.orderId);
    expect(second.queued).toBe(false);
    expect(await countPending()).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  test("una adición solo manda las líneas nuevas", async () => {
    const draft = await openDraft(TABLE);
    await addItem(draft.orderId, BANDEJA);

    serverAccepts();
    await sendDraft(draft.orderId);
    await flush();

    await addItem(draft.orderId, { ...BANDEJA, itemName: "Gaseosa", unitPrice: 5000 });
    await sendDraft(draft.orderId);
    await flush();

    const secondCall = rpc.mock.calls[1][1] as { p_order: { items: unknown[] } };
    expect(secondCall.p_order.items).toHaveLength(1);
  });

  test("el payload manda ids y cantidades, nunca precios", async () => {
    const draft = await openDraft(TABLE);
    await addItem(draft.orderId, BANDEJA);

    serverAccepts();
    await sendDraft(draft.orderId);
    await flush();

    const [, args] = rpc.mock.calls[0] as [string, { p_order: { items: object[] } }];
    const item = args.p_order.items[0];
    expect(item).not.toHaveProperty("unit_price");
    expect(item).toHaveProperty("menu_item_id");
    expect(item).toHaveProperty("qty");
  });

  test("varias líneas sin señal se acumulan y salen todas al volver", async () => {
    const draft = await openDraft(TABLE);
    networkDown();

    await addItem(draft.orderId, BANDEJA);
    await sendDraft(draft.orderId);
    await flush();

    await addItem(draft.orderId, { ...BANDEJA, itemName: "Gaseosa", unitPrice: 5000 });
    await sendDraft(draft.orderId);
    await flush();

    expect(await countPending()).toBe(2);

    serverAccepts();
    await flush();

    expect(await countPending()).toBe(0);
    const stored = await db.drafts.get(draft.orderId);
    expect(stored!.items.every((item) => item.syncedAt !== null)).toBe(true);
  });
});

describe("errores de negocio vs errores de red", () => {
  test("un rechazo del servidor NO se reintenta para siempre", async () => {
    const draft = await openDraft(TABLE);
    await addItem(draft.orderId, BANDEJA);

    serverRejects("ORDER_CLOSED");
    await sendDraft(draft.orderId);
    await flush();

    expect(await countPending()).toBe(0);
    expect(await countConflicts()).toBe(1);

    // Un segundo flush no vuelve a llamar: reintentar no cambiaría la respuesta.
    await flush();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  test("si la mesa ya tenía otro pedido, se guarda cuál para poder fusionar", async () => {
    const draft = await openDraft(TABLE);
    await addItem(draft.orderId, BANDEJA);

    serverRejects("TABLE_ALREADY_OPEN", { current_order_id: "el-otro-pedido" });
    await sendDraft(draft.orderId);
    await flush();

    const op = (await db.outbox.toArray())[0];
    expect(op.conflictCode).toBe("TABLE_ALREADY_OPEN");
    expect(op.lastError).toBe("el-otro-pedido");
  });

  test("un conflicto no bloquea el envío de las demás mesas", async () => {
    const a = await openDraft(TABLE);
    await addItem(a.orderId, BANDEJA);
    const b = await openDraft({ ...TABLE, tableId: "table-2", tableLabel: "6" });
    await addItem(b.orderId, BANDEJA);

    await sendDraft(a.orderId);
    await sendDraft(b.orderId);

    rpc
      .mockResolvedValueOnce({ data: { ok: false, code: "ORDER_CLOSED" }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, code: null }, error: null });

    await flush();

    expect(await countConflicts()).toBe(1);
    expect(await countPending()).toBe(0);
  });
});

describe("edición antes de enviar", () => {
  test("se puede cambiar la cantidad de lo que aún no salió", async () => {
    const draft = await openDraft(TABLE);
    await addItem(draft.orderId, BANDEJA);
    const item = (await db.drafts.get(draft.orderId))!.items[0];

    await changeQty(draft.orderId, item.id, 3);
    expect((await db.drafts.get(draft.orderId))!.items[0].qty).toBe(3);
  });

  test("lo ya confirmado no se puede tocar desde el celular", async () => {
    const draft = await openDraft(TABLE);
    await addItem(draft.orderId, BANDEJA);

    serverAccepts();
    await sendDraft(draft.orderId);
    await flush();

    const item = (await db.drafts.get(draft.orderId))!.items[0];
    await changeQty(draft.orderId, item.id, 9);

    // Sigue en 1: ajustar una línea que ya está en Caja es cosa de Caja.
    expect((await db.drafts.get(draft.orderId))!.items[0].qty).toBe(1);
  });

  test("bajar a 0 quita la línea que no se ha enviado", async () => {
    const draft = await openDraft(TABLE);
    await addItem(draft.orderId, BANDEJA);
    const item = (await db.drafts.get(draft.orderId))!.items[0];

    await changeQty(draft.orderId, item.id, 0);
    expect((await db.drafts.get(draft.orderId))!.items).toHaveLength(0);
  });
});
