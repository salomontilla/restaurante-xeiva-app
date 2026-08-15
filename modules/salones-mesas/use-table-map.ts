"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Database } from "@/lib/db.types";
import { getBrowserClient } from "@/lib/supabase/browser";

export type TableMapRow = Database["public"]["Views"]["v_table_map"]["Row"];

export type RealtimeStatus = "conectando" | "en-vivo" | "sin-conexion";

/**
 * Mapa de mesas en vivo para Caja.
 *
 * Se lee de `v_table_map`, la vista que ya resuelve de una sola consulta qué mesa tiene
 * pedido abierto, su total y si le falta imprimir algo. "Ocupada" no es una columna: es
 * `open_order_id != null`.
 *
 * Realtime se usa como DISPARADOR, no como fuente de datos: al llegar un evento de
 * `orders` o `tables` se vuelve a consultar la vista. Recibir la fila cruda del evento
 * obligaría a recalcular los totales y los conteos en el cliente —y a mantener esa
 * lógica sincronizada con el SQL de la vista—; además `replica identity` queda en
 * `default`, que es menos tráfico sobre un WiFi malo.
 *
 * `order_items` no está publicado a propósito: el detalle se recarga al abrir la mesa.
 */
export function useTableMap() {
  const [rows, setRows] = useState<TableMapRow[] | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>("conectando");
  const [error, setError] = useState<string | null>(null);

  // Los cambios llegan en ráfaga: cerrar un pedido toca `orders` y `tables` casi a la
  // vez. Sin agrupar, Caja dispararía tres consultas para el mismo hecho.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    const { data, error: queryError } = await getBrowserClient()
      .from("v_table_map")
      .select("*");

    if (queryError) {
      setError(queryError.message);
      return;
    }

    setError(null);
    setRows(data ?? []);
  }, []);

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
      .channel("caja-mapa-mesas")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, scheduleRefetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "tables" }, scheduleRefetch)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_checks" },
        scheduleRefetch,
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") setStatus("en-vivo");
        else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") setStatus("sin-conexion");
      });

    // Red de seguridad: si el WebSocket se cae sin avisar, Caja no puede quedarse con un
    // mapa congelado. Una consulta por minuto es barata y evita cobrar una mesa que ya
    // no está ocupada.
    const heartbeat = setInterval(() => void refetch(), 60_000);

    return () => {
      clearTimeout(initial);
      if (debounce.current) clearTimeout(debounce.current);
      clearInterval(heartbeat);
      void supabase.removeChannel(channel);
    };
  }, [refetch, scheduleRefetch]);

  return { rows, status, error, refetch };
}
