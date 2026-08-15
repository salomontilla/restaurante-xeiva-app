"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Database } from "@/lib/db.types";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { TableMapRow } from "@/modules/salones-mesas/use-table-map";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type OrderCheckRow = Database["public"]["Tables"]["order_checks"]["Row"];

export type OrderDetail = {
  table: TableMapRow | null;
  order: OrderRow | null;
  items: OrderItemRow[];
  checks: OrderCheckRow[];
};

/**
 * Detalle de la mesa para Caja: la mesa, su pedido abierto, sus líneas y sus subcuentas.
 *
 * Se suscribe a `orders` filtrando por esta mesa. Alcanza para enterarse de TODO lo que
 * importa aunque `order_items` no esté publicado: cualquier línea que agregue el mesero
 * dispara el trigger que recalcula `orders.total`, y ese UPDATE llega como evento. Es
 * decir, el total actuando de campana para el detalle.
 */
export function useOrderDetail(tableId: string) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    const supabase = getBrowserClient();

    const { data: table, error: tableError } = await supabase
      .from("v_table_map")
      .select("*")
      .eq("table_id", tableId)
      .maybeSingle();

    if (tableError) {
      setError(tableError.message);
      return;
    }

    if (!table?.open_order_id) {
      setError(null);
      setDetail({ table: table ?? null, order: null, items: [], checks: [] });
      return;
    }

    const [orderResult, itemsResult, checksResult] = await Promise.all([
      supabase.from("orders").select("*").eq("id", table.open_order_id).maybeSingle(),
      supabase
        .from("order_items")
        .select("*")
        .eq("order_id", table.open_order_id)
        .order("client_created_at"),
      supabase
        .from("order_checks")
        .select("*")
        .eq("order_id", table.open_order_id)
        .order("seq"),
    ]);

    setError(orderResult.error?.message ?? itemsResult.error?.message ?? null);
    setDetail({
      table,
      order: orderResult.data ?? null,
      items: itemsResult.data ?? [],
      checks: checksResult.data ?? [],
    });
  }, [tableId]);

  const scheduleRefetch = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void refetch(), 250);
  }, [refetch]);

  useEffect(() => {
    // Aplazado un tick para no llamar a setState durante el cuerpo del efecto, que
    // dispara renders en cascada.
    const initial = setTimeout(() => void refetch(), 0);

    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`caja-mesa-${tableId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `table_id=eq.${tableId}` },
        scheduleRefetch,
      )
      .subscribe();

    return () => {
      clearTimeout(initial);
      if (debounce.current) clearTimeout(debounce.current);
      void supabase.removeChannel(channel);
    };
  }, [tableId, refetch, scheduleRefetch]);

  return { detail, error, refetch };
}
