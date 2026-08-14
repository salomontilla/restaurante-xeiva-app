/**
 * Forma del resultado de todos los RPC del proyecto.
 *
 * Los RPC no lanzan excepciones para los casos de negocio esperados (mesa ya tomada,
 * pedido cerrado, el pago no cuadra): devuelven `{ ok: false, code }`. Esto es
 * deliberado — el cliente offline del mesero necesita distinguir un error de NEGOCIO
 * (que no se debe reintentar, hay que mostrárselo a la persona) de un error de RED
 * (que sí se reintenta solo). Una excepción de Postgres no permite esa distinción.
 */
export type RpcError =
  /** Otro mesero tomó la mesa primero. */
  | "TABLE_TAKEN"
  /** La mesa ya tiene un pedido abierto distinto al que se está enviando. */
  | "TABLE_ALREADY_OPEN"
  /** El pedido ya fue cerrado y pagado; no admite más líneas. */
  | "ORDER_CLOSED"
  /** Todas las subcuentas ya están pagadas. */
  | "ALL_CHECKS_PAID"
  /** La suma de los pagos no coincide con el total de la subcuenta. */
  | "AMOUNT_MISMATCH"
  /** La subcuenta ya fue pagada. */
  | "CHECK_PAID"
  /** El usuario no tiene permiso para esta operación. */
  | "FORBIDDEN"
  /** El plato, la mesa o el pedido referenciado no existe. */
  | "NOT_FOUND"
  /** La línea ya se imprimió: solo Caja puede anularla. */
  | "ITEM_PRINTED";

export type RpcResult<T> =
  | ({ ok: true; code: null } & T)
  | { ok: false; code: RpcError; [key: string]: unknown };

export function isOk<T>(r: RpcResult<T>): r is { ok: true; code: null } & T {
  return r.ok === true;
}

/** Mensajes en español para mostrarle al usuario. */
export const RPC_ERROR_MESSAGES: Record<RpcError, string> = {
  TABLE_TAKEN: "Otro mesero tomó esta mesa primero.",
  TABLE_ALREADY_OPEN: "Esta mesa ya tiene un pedido abierto.",
  ORDER_CLOSED: "Este pedido ya fue cerrado y pagado.",
  ALL_CHECKS_PAID: "Todas las cuentas de esta mesa ya están pagadas.",
  AMOUNT_MISMATCH: "El pago no cuadra con el total de la cuenta.",
  CHECK_PAID: "Esta cuenta ya fue pagada.",
  FORBIDDEN: "No tienes permiso para hacer esto.",
  NOT_FOUND: "No se encontró el registro.",
  ITEM_PRINTED: "Esta línea ya fue a cocina: solo Caja puede anularla.",
};
