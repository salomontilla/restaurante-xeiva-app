"use client";

import { RPC_ERROR_MESSAGES, type RpcError } from "@/lib/result";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Arqueo de caja.
 *
 * Todo pasa por RPC: la tabla `cash_sessions` no tiene INSERT ni UPDATE para nadie, ni
 * siquiera para admin. El valor entero de un arqueo es que el esperado sea una foto no
 * manipulable; si existiera un UPDATE directo dejaría de ser evidencia de nada.
 */

export type CashSession = {
  id: string;
  seq: number;
  business_date: string;
  opened_at: string;
  opening_float: number;
  closed_at: string | null;
  expected_cash: number | null;
  counted_cash: number | null;
  expected_transfers: number | null;
  counted_transfers: number | null;
  cash_difference: number | null;
  transfer_difference: number | null;
  notes: string | null;
  amended_at: string | null;
  amended_from: number | null;
  amend_reason: string | null;
};

export type CashMovement = {
  id: string;
  kind: "retiro" | "ingreso";
  amount: number;
  reason: string;
  created_at: string;
};

export type CashSessionDetail = {
  session: CashSession | null;
  opened_by_name: string | null;
  closed_by_name: string | null;
  sales_cash: number;
  sales_transfers: number;
  movements_in: number;
  movements_out: number;
  live_expected_cash: number;
  payments_count: number;
  movements: CashMovement[];
  transfers: { amount: number; reference: string | null; created_at: string }[];
  late_cash: number;
};

type Fail = { ok: false; code: string | null; message: string; openOrders?: number; expected?: number };

function fail(code: string | null | undefined, fallback: string, extra?: object): Fail {
  const known = code && code in RPC_ERROR_MESSAGES;
  return {
    ok: false,
    code: code ?? null,
    message: known ? RPC_ERROR_MESSAGES[code as RpcError] : fallback,
    ...extra,
  };
}

export async function getCashSession(
  sessionId?: string,
): Promise<{ ok: true; detail: CashSessionDetail } | Fail> {
  const { data, error } = await getBrowserClient().rpc("get_cash_session", {
    p_session_id: sessionId ?? undefined,
  });

  if (error) return fail(null, error.message);

  const result = data as ({ ok: boolean; code: string | null } & CashSessionDetail) | null;
  if (!result?.ok) return fail(result?.code, "No se pudo cargar el arqueo.");

  return { ok: true, detail: result };
}

export async function openCashSession(
  openingFloat: number,
): Promise<{ ok: true; sessionId: string } | Fail> {
  const { data, error } = await getBrowserClient().rpc("open_cash_session", {
    p_opening_float: openingFloat,
  });

  if (error) return fail(null, error.message);

  const result = data as { ok: boolean; code: string | null; session_id?: string } | null;
  if (!result?.ok) return fail(result?.code, "No se pudo abrir la caja.");

  return { ok: true, sessionId: result.session_id! };
}

export async function addCashMovement(
  kind: "retiro" | "ingreso",
  amount: number,
  reason: string,
): Promise<{ ok: true } | Fail> {
  const { data, error } = await getBrowserClient().rpc("add_cash_movement", {
    p_kind: kind,
    p_amount: amount,
    p_reason: reason,
  });

  if (error) return fail(null, error.message);

  const result = data as { ok: boolean; code: string | null } | null;
  if (!result?.ok) return fail(result?.code, "No se pudo registrar el movimiento.");

  return { ok: true };
}

/**
 * Cierra el arqueo.
 *
 * `allowOpenOrders` es el segundo intento: la primera llamada avisa si quedan mesas sin
 * cobrar y la UI pregunta. Cobrar nunca se bloquea por el arqueo, pero cerrar sin darse
 * cuenta de que faltan mesas sí produce pagos huérfanos.
 */
export async function closeCashSession(input: {
  sessionId: string;
  countedCash: number;
  countedTransfers?: number | null;
  notes?: string | null;
  allowOpenOrders?: boolean;
}): Promise<{ ok: true; difference: number; expected: number } | Fail> {
  const { data, error } = await getBrowserClient().rpc("close_cash_session", {
    p_session_id: input.sessionId,
    p_counted_cash: input.countedCash,
    p_counted_transfers: input.countedTransfers ?? undefined,
    p_notes: input.notes ?? undefined,
    p_allow_open_orders: input.allowOpenOrders ?? false,
  });

  if (error) return fail(null, error.message);

  const result = data as {
    ok: boolean;
    code: string | null;
    open_orders?: number;
    expected_cash?: number;
    cash_difference?: number;
  } | null;

  if (!result?.ok) {
    return fail(result?.code, "No se pudo cerrar la caja.", {
      openOrders: result?.open_orders,
      expected: result?.expected_cash,
    });
  }

  return {
    ok: true,
    difference: Number(result.cash_difference ?? 0),
    expected: Number(result.expected_cash ?? 0),
  };
}

export async function amendCashSession(
  sessionId: string,
  countedCash: number,
  reason: string,
): Promise<{ ok: true } | Fail> {
  const { data, error } = await getBrowserClient().rpc("amend_cash_session", {
    p_session_id: sessionId,
    p_counted_cash: countedCash,
    p_reason: reason,
  });

  if (error) return fail(null, error.message);

  const result = data as { ok: boolean; code: string | null } | null;
  if (!result?.ok) return fail(result?.code, "No se pudo corregir el arqueo.");

  return { ok: true };
}
