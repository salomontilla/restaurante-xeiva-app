"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import { db, type CachedTable } from "@/modules/offline/db";
import { useOffline } from "@/modules/offline/offline-provider";
import { claimTable } from "@/modules/salones-mesas/claim";

type TableState = "libre" | "mia" | "ajena";

function stateOf(table: CachedTable, waiterId: string): TableState {
  if (table.assignedWaiterId === waiterId) return "mia";
  if (table.assignedWaiterId || table.openOrderId) return "ajena";
  return "libre";
}

/**
 * Las mesas del restaurante, agrupadas por salón.
 *
 * Tres estados con lectura distinta a un metro de distancia, porque el mesero mira esto
 * de pie y con prisa:
 *   · mía     → puede pedir
 *   · libre   → puede tomarla (necesita señal)
 *   · ajena   → la ve, pero no la toca
 *
 * Se lee de IndexedDB, así que funciona sin señal con lo último que se alcanzó a traer.
 */
export function TablesScreen({
  waiterId,
  onOpenTable,
}: {
  waiterId: string;
  onOpenTable: (table: CachedTable) => void;
}) {
  const { status, refresh } = useOffline();
  const [claiming, setClaiming] = useState<string | null>(null);

  const tables = useLiveQuery(() => db.myTables.toArray(), [], undefined);

  if (tables === undefined) {
    return <p className="text-muted-foreground p-4 text-sm">Cargando mesas…</p>;
  }

  if (tables.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-muted-foreground text-sm">
          No hay mesas guardadas en este celular todavía.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-primary self-start text-sm underline"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const rooms = [...new Map(tables.map((t) => [t.roomId, t])).values()].sort(
    (a, b) => a.roomSortOrder - b.roomSortOrder || a.roomName.localeCompare(b.roomName),
  );

  async function onTableClick(table: CachedTable) {
    const state = stateOf(table, waiterId);

    if (state === "mia") return onOpenTable(table);

    if (state === "ajena") {
      toast.info(
        table.assignedWaiterName
          ? `La mesa ${table.tableLabel} la está atendiendo ${table.assignedWaiterName}.`
          : `La mesa ${table.tableLabel} ya tiene un pedido abierto.`,
      );
      return;
    }

    // Tomar una mesa es lo único que exige conexión: dos meseros sin señal no pueden
    // resolver entre sí quién se quedó con ella.
    if (status === "offline") {
      toast.error("Sin conexión: no puedes tomar mesas nuevas hasta que vuelva la señal.");
      return;
    }

    setClaiming(table.tableId);
    const result = await claimTable(table.tableId);
    setClaiming(null);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    onOpenTable({ ...table, assignedWaiterId: waiterId });
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {rooms.map((room) => {
        const roomTables = tables
          .filter((t) => t.roomId === room.roomId)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.tableLabel.localeCompare(b.tableLabel));

        return (
          <section key={room.roomId} className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              {room.roomName}
            </h2>

            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {roomTables.map((table) => {
                const state = stateOf(table, waiterId);

                return (
                  <li key={table.tableId}>
                    <button
                      type="button"
                      onClick={() => void onTableClick(table)}
                      disabled={claiming === table.tableId}
                      /* min-h-24: objetivo táctil grande, para usar de pie y con prisa. */
                      className={cn(
                        "flex min-h-24 w-full flex-col items-start justify-between rounded-lg border-2 p-3 text-left transition-colors",
                        state === "mia" && "border-primary bg-primary/5",
                        state === "ajena" && "border-muted bg-muted/40 text-muted-foreground",
                        state === "libre" && "border-dashed",
                      )}
                    >
                      <span className="text-lg font-semibold">{table.tableLabel}</span>

                      {state === "mia" ? (
                        <span className="flex flex-col items-start gap-1">
                          <Badge>Mía</Badge>
                          {table.openOrderTotal ? (
                            <span className="text-sm font-medium">
                              {formatMoney(table.openOrderTotal)}
                            </span>
                          ) : null}
                        </span>
                      ) : null}

                      {state === "ajena" ? (
                        <span className="text-xs">
                          {table.assignedWaiterName ?? "Ocupada"}
                        </span>
                      ) : null}

                      {state === "libre" ? (
                        <span className="text-muted-foreground text-xs">
                          {claiming === table.tableId ? "Tomando…" : "Libre"}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
