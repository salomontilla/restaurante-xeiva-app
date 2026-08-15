"use client";

import { Printer, RefreshCw, WifiOff } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

import { useTableMap, type TableMapRow } from "../use-table-map";

/**
 * Mapa de mesas de Caja, en vivo.
 *
 * Lo que Caja necesita ver de un vistazo, en este orden:
 *   1. qué mesas tienen algo SIN IMPRIMIR  → hay comida esperando ir a Cocina
 *   2. qué mesas están ocupadas y por cuánto
 *   3. qué mesas están libres
 */
export function TableMap() {
  const { rows, status, error, refetch } = useTableMap();

  if (rows === null) {
    return <p className="text-muted-foreground p-4 text-sm">Cargando mesas…</p>;
  }

  const rooms = [...new Map(rows.map((row) => [row.dining_room_id, row])).values()].sort(
    (a, b) =>
      (a.dining_room_sort_order ?? 0) - (b.dining_room_sort_order ?? 0) ||
      (a.dining_room_name ?? "").localeCompare(b.dining_room_name ?? ""),
  );

  const pendientes = rows.filter((row) => row.has_unprinted_items);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Mesas</h1>
          <p className="text-muted-foreground text-sm">
            {rows.filter((r) => r.is_occupied).length} ocupadas de {rows.length}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {status === "sin-conexion" ? (
            <Badge variant="destructive" className="gap-1">
              <WifiOff className="size-3" />
              Sin tiempo real
            </Badge>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => void refetch()} aria-label="Actualizar">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {/* Lo que falta llevar a Cocina va arriba: es la única acción urgente de Caja. */}
      {pendientes.length > 0 ? (
        <section className="border-primary flex flex-col gap-2 rounded-lg border-2 p-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Printer className="size-4" />
            Por imprimir para Cocina
          </h2>
          <div className="flex flex-wrap gap-2">
            {pendientes.map((row) => (
              <Button
                key={row.table_id}
                size="sm"
                render={<Link href={`/caja/mesa/${row.table_id}`} />}
              >
                {row.dining_room_name} · Mesa {row.table_label}
              </Button>
            ))}
          </div>
        </section>
      ) : null}

      {rooms.map((room) => {
        const roomTables = rows
          .filter((row) => row.dining_room_id === room.dining_room_id)
          .sort(
            (a, b) =>
              (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
              (a.table_label ?? "").localeCompare(b.table_label ?? ""),
          );

        return (
          <section key={room.dining_room_id} className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              {room.dining_room_name}
            </h2>

            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {roomTables.map((row) => (
                <li key={row.table_id}>
                  <TableCard row={row} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function TableCard({ row }: { row: TableMapRow }) {
  const occupied = row.is_occupied ?? false;

  return (
    <Link
      href={`/caja/mesa/${row.table_id}`}
      className={cn(
        "flex min-h-28 flex-col justify-between rounded-lg border-2 p-3 transition-colors",
        occupied ? "border-primary bg-primary/5" : "hover:bg-accent border-dashed",
        row.has_unprinted_items && "ring-primary ring-2 ring-offset-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-lg font-semibold">{row.table_label}</span>
        {row.has_unprinted_items ? (
          <Printer className="text-primary size-4 shrink-0" />
        ) : null}
      </div>

      {occupied ? (
        <div className="flex flex-col gap-0.5">
          <span className="font-medium tabular-nums">{formatMoney(row.open_order_total)}</span>
          <span className="text-muted-foreground truncate text-xs">
            {row.assigned_waiter_name ?? "Sin mesero"}
          </span>
          {(row.checks_count ?? 0) > 1 ? (
            <Badge variant="secondary" className="w-fit text-xs">
              {row.checks_count} cuentas
            </Badge>
          ) : null}
        </div>
      ) : (
        <span className="text-muted-foreground text-xs">Libre</span>
      )}
    </Link>
  );
}
