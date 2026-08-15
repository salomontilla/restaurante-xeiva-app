"use client";

import { v7 as uuidv7 } from "uuid";

import { RPC_ERROR_MESSAGES, type RpcError } from "@/lib/result";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Cobro y división de cuentas.
 *
 * Todo pasa por RPC porque toca dinero: el INSERT directo sobre `payments` está
 * revocado para los clientes. `close_check` valida en la MISMA transacción que la suma
 * de los pagos cuadre con el total de la subcuenta, así que la validación que hace esta
 * pantalla es solo para no hacerle perder el viaje al cajero — la de verdad es la del
 * servidor.
 */

export type PagosResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; message: string; expected?: number };

function messageFor(code: string | null | undefined, fallback: string): string {
  if (code && code in RPC_ERROR_MESSAGES) return RPC_ERROR_MESSAGES[code as RpcError];
  return fallback;
}

export type PaymentEntry = {
  method: "efectivo" | "transferencia";
  amount: number;
  /** Solo efectivo: con cuánto pagó el cliente, para calcular el vuelto. */
  tendered?: number | null;
  /** Solo transferencia: comprobante. */
  reference?: string | null;
};

/**
 * Divide el pedido en subcuentas y arrastra cada línea a la suya.
 *
 * `assignments` mapea número de cuenta → líneas. Las que no se mencionen se quedan
 * donde están, y las subcuentas que queden vacías se eliminan solas en el servidor.
 */
export async function splitOrder(
  orderId: string,
  assignments: { seq: number; itemIds: string[] }[],
): Promise<PagosResult> {
  const { data, error } = await getBrowserClient().rpc("split_order", {
    p_order_id: orderId,
    p_assignments: assignments.map((a) => ({ seq: a.seq, item_ids: a.itemIds })),
  });

  if (error) return { ok: false, message: error.message };

  const result = data as { ok: boolean; code: string | null } | null;
  if (!result?.ok) {
    return { ok: false, message: messageFor(result?.code, "No se pudo dividir la cuenta.") };
  }

  return { ok: true };
}

/**
 * Parte una línea por cantidad.
 *
 * Es lo que permite que dos personas compartan un plato: una línea de 2 se convierte en
 * dos de 1, y cada una puede ir a una subcuenta distinta. Un plato siempre pertenece a
 * una sola cuenta.
 */
export async function splitLine(itemId: string, qty: number): Promise<PagosResult> {
  const { data, error } = await getBrowserClient().rpc("split_order_line", {
    p_item_id: itemId,
    p_qty: qty,
    p_new_item_id: uuidv7(),
  });

  if (error) return { ok: false, message: error.message };

  const result = data as { ok: boolean; code: string | null } | null;
  if (!result?.ok) {
    return { ok: false, message: messageFor(result?.code, "No se pudo dividir la línea.") };
  }

  return { ok: true };
}

/**
 * Cobra una subcuenta.
 *
 * Un pago mixto son simplemente dos entradas en el arreglo, una por método — no existe
 * un método "mixto". Cuando se paga la ÚLTIMA subcuenta, el servidor cierra el pedido y
 * libera la mesa sin que haya que pedírselo: el índice único parcial deja de aplicar.
 */
export async function closeCheck(
  checkId: string,
  payments: PaymentEntry[],
): Promise<PagosResult<{ orderClosed: boolean; checksRemaining: number }>> {
  const { data, error } = await getBrowserClient().rpc("close_check", {
    p_check_id: checkId,
    p_payments: payments.map((p) => ({
      method: p.method,
      amount: p.amount,
      tendered: p.tendered ?? null,
      reference: p.reference ?? null,
    })),
  });

  if (error) return { ok: false, message: error.message };

  const result = data as {
    ok: boolean;
    code: string | null;
    expected?: number;
    order_closed?: boolean;
    checks_remaining?: number;
  } | null;

  if (!result?.ok) {
    return {
      ok: false,
      message: messageFor(result?.code, "No se pudo registrar el pago."),
      expected: result?.expected,
    };
  }

  return {
    ok: true,
    orderClosed: result.order_closed ?? false,
    checksRemaining: result.checks_remaining ?? 0,
  };
}

export type Receipt = {
  restaurant: { name: string; address: string | null; phone: string | null; receipt_footer: string | null } | null;
  order: { id: string; table_label: string; closed_at: string | null; business_date: string };
  check: { id: string; seq: number; total: number; paid_at: string | null };
  dining_room: string | null;
  waiter: string | null;
  checks_total: number;
  items: {
    qty: number;
    item_name: string;
    variant_name: string | null;
    unit_price: number;
    line_total: number;
  }[];
  payments: {
    method: "efectivo" | "transferencia";
    amount: number;
    tendered: number | null;
    reference: string | null;
    change: number | null;
  }[];
};

export async function getReceipt(
  checkId: string,
): Promise<{ ok: true; receipt: Receipt } | { ok: false; message: string }> {
  const { data, error } = await getBrowserClient().rpc("get_receipt", { p_check_id: checkId });

  if (error) return { ok: false, message: error.message };

  const result = data as ({ ok: boolean; code: string | null } & Receipt) | null;
  if (!result?.ok) {
    return { ok: false, message: messageFor(result?.code, "No se pudo cargar el recibo.") };
  }

  return { ok: true, receipt: result };
}
