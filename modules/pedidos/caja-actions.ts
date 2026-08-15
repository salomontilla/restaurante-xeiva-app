"use client";

import { v7 as uuidv7 } from "uuid";

import { getBrowserClient } from "@/lib/supabase/browser";
import { RPC_ERROR_MESSAGES, type RpcError } from "@/lib/result";
import type { MenuPick } from "@/modules/menu/types";

/**
 * Operaciones de Caja sobre un pedido.
 *
 * Caja habla DIRECTO con Postgres desde el navegador, igual que el mesero, porque
 * necesita el WebSocket de Realtime en la misma sesión. La diferencia es que Caja está
 * en una estación fija con red: no hay cola offline, las llamadas se hacen y se esperan.
 *
 * Agregar platos usa el MISMO `submit_order` que el mesero. Si el pedido ya existe, la
 * cabecera se ignora y solo entran las líneas nuevas — por eso no hace falta un RPC
 * aparte para "adición".
 */

type Result = { ok: true; orderId: string } | { ok: false; message: string };

function messageFor(code: string | null | undefined, fallback: string): string {
  if (code && code in RPC_ERROR_MESSAGES) return RPC_ERROR_MESSAGES[code as RpcError];
  return fallback;
}

/**
 * Agrega platos a la mesa. Si no había pedido abierto, lo crea.
 *
 * El id lo genera el navegador antes de llamar, igual que en el celular del mesero: un
 * solo camino de código y reintentar nunca duplica.
 */
export async function addItemsToTable(
  tableId: string,
  orderId: string | null,
  picks: MenuPick[],
): Promise<Result> {
  if (picks.length === 0) return { ok: false, message: "No hay nada que agregar." };

  const now = new Date().toISOString();
  const targetOrderId = orderId ?? uuidv7();

  const { data, error } = await getBrowserClient().rpc("submit_order", {
    p_order: {
      id: targetOrderId,
      table_id: tableId,
      client_created_at: now,
      items: picks.map((pick) => ({
        id: uuidv7(),
        menu_item_id: pick.item.id,
        variant_id: pick.variant?.id ?? null,
        qty: 1,
        note: null,
        client_created_at: now,
      })),
    },
  });

  if (error) return { ok: false, message: error.message };

  const result = data as { ok: boolean; code: string | null } | null;
  if (!result?.ok) {
    return { ok: false, message: messageFor(result?.code, "No se pudo agregar.") };
  }

  return { ok: true, orderId: targetOrderId };
}

/**
 * Anula una línea que YA fue a Cocina.
 *
 * No se borra: la comida se preparó y eso es información contable. Queda registrada con
 * quién la anuló y cuándo. Las líneas sin imprimir se eliminan de verdad (ver `deleteItem`).
 */
export async function voidItem(itemId: string, reason?: string): Promise<Result> {
  const { data, error } = await getBrowserClient().rpc("void_order_item", {
    p_item_id: itemId,
    p_reason: reason,
  });

  if (error) return { ok: false, message: error.message };

  const result = data as { ok: boolean; code: string | null } | null;
  if (!result?.ok) return { ok: false, message: messageFor(result?.code, "No se pudo anular.") };

  return { ok: true, orderId: "" };
}

/** Elimina una línea que aún no se imprimió. La política de RLS es la que lo permite. */
export async function deleteItem(itemId: string): Promise<Result> {
  const { error } = await getBrowserClient().from("order_items").delete().eq("id", itemId);

  if (error) return { ok: false, message: error.message };
  return { ok: true, orderId: "" };
}

/**
 * Cambia la observación de una línea.
 *
 * Solo funciona mientras la línea no se haya impreso: la política RLS
 * `order_items_update_unprinted` lo garantiza. Cambiarla después no cambiaría el papel
 * que el cocinero ya tiene en la mano, y dejaría la base afirmando algo distinto de lo
 * que se preparó.
 */
export async function changeItemNote(itemId: string, note: string | null): Promise<Result> {
  const { error } = await getBrowserClient()
    .from("order_items")
    .update({ note })
    .eq("id", itemId);

  if (error) return { ok: false, message: error.message };
  return { ok: true, orderId: "" };
}

export async function changeItemQty(itemId: string, qty: number): Promise<Result> {
  if (qty < 1) return deleteItem(itemId);

  const { error } = await getBrowserClient()
    .from("order_items")
    .update({ qty })
    .eq("id", itemId);

  if (error) return { ok: false, message: error.message };
  return { ok: true, orderId: "" };
}

/** Sella como impresas las líneas que acaban de salir por la impresora. */
export async function markPrinted(orderId: string): Promise<Result & { printed?: number }> {
  const { data, error } = await getBrowserClient().rpc("mark_order_printed", {
    p_order_id: orderId,
  });

  if (error) return { ok: false, message: error.message };

  const result = data as { ok: boolean; printed_items?: number } | null;
  return { ok: true, orderId, printed: result?.printed_items ?? 0 };
}

export type Ticket = {
  restaurant: { name: string; address: string | null; phone: string | null } | null;
  order: { id: string; table_label: string; opened_at: string; note: string | null };
  dining_room: string | null;
  waiter: string | null;
  is_addition: boolean;
  printed_now_at: string;
  items: {
    id: string;
    qty: number;
    item_name: string;
    variant_name: string | null;
    note: string | null;
  }[];
};

/**
 * Trae la comanda lista para imprimir.
 *
 * Con `onlyUnprinted` devuelve SOLO lo que aún no fue a Cocina, que es el caso de las
 * adiciones. No marca nada: sellar es una llamada aparte, para que una impresión que
 * falla no dé por enviado a Cocina algo que nunca salió en papel.
 */
export async function getTicket(
  orderId: string,
  onlyUnprinted: boolean,
): Promise<{ ok: true; ticket: Ticket } | { ok: false; message: string }> {
  const { data, error } = await getBrowserClient().rpc("get_order_ticket", {
    p_order_id: orderId,
    p_only_unprinted: onlyUnprinted,
  });

  if (error) return { ok: false, message: error.message };

  const result = data as ({ ok: boolean; code: string | null } & Ticket) | null;
  if (!result?.ok) {
    return { ok: false, message: messageFor(result?.code, "No se pudo cargar la comanda.") };
  }

  return { ok: true, ticket: result };
}
