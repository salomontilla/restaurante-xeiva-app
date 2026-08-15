"use client";

import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useOffline } from "../offline-provider";

/**
 * Estado de sincronización, siempre visible.
 *
 * Tiene que decir tres cosas DISTINTAS sin ambigüedad, porque significan cosas distintas
 * para el mesero:
 *   · sin conexión        → puede seguir tomando pedidos, pero no tomar mesas nuevas
 *   · N pendientes        → lo que escribió está guardado, todavía no llegó a Caja
 *   · N sin resolver      → el servidor rechazó algo y hace falta que alguien decida
 *
 * Que el mesero nunca crea que perdió un pedido es la mitad del trabajo de esta pantalla.
 */
export function SyncBadge({ onShowConflicts }: { onShowConflicts: () => void }) {
  const { status, pendingCount, conflictCount, refresh, refreshing } = useOffline();

  const offline = status === "offline";

  if (!offline && pendingCount === 0 && conflictCount === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void refresh()}
        disabled={refreshing}
        aria-label="Actualizar"
      >
        <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {conflictCount > 0 ? (
        <Button
          variant="destructive"
          size="sm"
          onClick={onShowConflicts}
          className="h-9 gap-1.5"
        >
          <TriangleAlert className="size-4" />
          {conflictCount} sin resolver
        </Button>
      ) : null}

      {offline || pendingCount > 0 ? (
        <button
          type="button"
          onClick={() => void refresh()}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium",
            offline ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground",
          )}
        >
          {offline ? <CloudOff className="size-4" /> : <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />}
          {offline ? "Sin conexión" : null}
          {pendingCount > 0 ? (
            <span>
              {offline ? "·" : ""} {pendingCount} por enviar
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
