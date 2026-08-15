import "server-only";

import { getServerClient } from "@/lib/supabase/server";

/**
 * Consultas de ventas.
 *
 * El restaurante abre SOLO domingos y festivos, así que las jornadas son escasas e
 * irregulares. Todo aquí razona en "jornadas que existen", no en rangos de calendario:
 * un selector de fechas continuo mostraría cinco días vacíos por semana y un gráfico de
 * líneas dibujaría una pendiente atravesando días en que el local estuvo cerrado.
 */

export type SalesSummary = {
  from: string;
  to: string;
  totals: {
    orders_count: number;
    gross_total: number;
    cash_total: number;
    transfer_total: number;
  };
  by_day: {
    business_date: string;
    orders_count: number;
    gross_total: number;
    cash_total: number;
    transfer_total: number;
    avg_ticket: number;
  }[];
  by_dining_room: { dining_room_name: string; orders_count: number; total: number }[];
  top_items: {
    item_name: string;
    variant_name: string | null;
    qty_sold: number;
    total: number;
  }[];
};

export type WaiterSales = {
  full_name: string | null;
  orders_count: number;
  total: number;
};

/** Las jornadas con ventas, de la más reciente a la más antigua. */
export async function listJornadas(): Promise<string[]> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("v_sales_daily")
    .select("business_date")
    .order("business_date", { ascending: false });

  if (error) throw new Error(`No se pudieron cargar las jornadas: ${error.message}`);
  return (data ?? []).map((row) => row.business_date!).filter(Boolean);
}

export async function getSalesSummary(from: string, to: string): Promise<SalesSummary> {
  const supabase = await getServerClient();

  const { data, error } = await supabase.rpc("sales_summary", { p_from: from, p_to: to });

  if (error) throw new Error(`No se pudieron cargar las ventas: ${error.message}`);
  return data as unknown as SalesSummary;
}

/**
 * Ventas por mesero. No viene en `sales_summary` porque no es parte del tablero
 * principal: es una consulta puntual, y la vista ya la resuelve.
 */
export async function getSalesByWaiter(from: string, to: string): Promise<WaiterSales[]> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("v_sales_by_waiter")
    .select("full_name, orders_count, total")
    .gte("business_date", from)
    .lte("business_date", to);

  if (error) throw new Error(`No se pudieron cargar las ventas por mesero: ${error.message}`);

  // La vista devuelve una fila por jornada y mesero; aquí interesa el acumulado.
  const byWaiter = new Map<string, WaiterSales>();

  for (const row of data ?? []) {
    const key = row.full_name ?? "Sin mesero";
    const current = byWaiter.get(key) ?? { full_name: key, orders_count: 0, total: 0 };
    current.orders_count += row.orders_count ?? 0;
    current.total += Number(row.total ?? 0);
    byWaiter.set(key, current);
  }

  return [...byWaiter.values()].sort((a, b) => b.total - a.total);
}

/**
 * Resuelve el rango a consultar a partir de los parámetros de la URL.
 *
 * Los presets se expresan en NÚMERO DE JORNADAS, no en días: "las últimas 4 jornadas"
 * es lo que un dueño de restaurante que abre domingos realmente quiere ver. Un "últimos
 * 30 días" traería cuatro domingos y veintiséis días vacíos.
 */
export function resolveRange(
  jornadas: string[],
  params: { desde?: string; hasta?: string; ultimas?: string },
): { from: string; to: string; preset: number | null } {
  if (params.desde && params.hasta) {
    return { from: params.desde, to: params.hasta, preset: null };
  }

  if (jornadas.length === 0) {
    const today = new Date().toISOString().slice(0, 10);
    return { from: today, to: today, preset: null };
  }

  const requested = Number(params.ultimas ?? 4);
  const count = Number.isFinite(requested) && requested > 0 ? requested : 4;
  const slice = jornadas.slice(0, count);

  return {
    from: slice[slice.length - 1],
    to: slice[0],
    preset: count,
  };
}

/** `2026-08-14` → `domingo, 14 de agosto` */
export function formatJornada(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatJornadaShort(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
  });
}
