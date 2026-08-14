/**
 * Dinero. En este proyecto NUNCA se suma en JavaScript.
 *
 * Todos los totales (línea, subcuenta, pedido) los calcula Postgres con `numeric`:
 * `order_items.line_total` es una columna generada y los totales de `order_checks`
 * y `orders` los mantiene un trigger. Aquí solo se formatea para mostrar.
 *
 * Supabase devuelve `numeric` como string para no perder precisión — de ahí que
 * estas funciones acepten `string | number`.
 */

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** `45000` → `"$ 45.000"`. Para mostrar en pantalla y en recibos. */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return COP.format(0);
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? COP.format(n) : COP.format(0);
}

/** Convierte a número para comparaciones en UI (ej. validar que el pago cuadre). */
export function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : 0;
}
