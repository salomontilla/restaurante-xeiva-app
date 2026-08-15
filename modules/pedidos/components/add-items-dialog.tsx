"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatMoney } from "@/lib/money";
import { MenuPickerView } from "@/modules/menu/components/menu-picker-view";
import type { MenuPick } from "@/modules/menu/types";
import { useMenuSnapshot } from "@/modules/menu/use-menu-snapshot";

import { addItemsToTable } from "../caja-actions";

/**
 * Agregar platos desde Caja.
 *
 * Los platos se acumulan en una lista y se mandan en UNA sola llamada al confirmar, en
 * vez de una llamada por plato. Con seis platos eso es una petición en lugar de seis, y
 * si algo falla no queda medio pedido a medias.
 */
export function AddItemsDialog({
  tableId,
  orderId,
  onDone,
}: {
  tableId: string;
  orderId: string | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<MenuPick[]>([]);
  const [sending, setSending] = useState(false);
  const { menu, error } = useMenuSnapshot(open);

  const total = picks.reduce((sum, pick) => sum + pick.unitPrice, 0);

  async function confirm() {
    setSending(true);
    const result = await addItemsToTable(tableId, orderId, picks);
    setSending(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(`${picks.length} plato(s) agregados.`);
    setPicks([]);
    setOpen(false);
    onDone();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPicks([]);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" className="h-12">
            <Plus className="size-4" />
            Agregar platos
          </Button>
        }
      />

      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agregar platos</DialogTitle>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        {picks.length > 0 ? (
          <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border p-2">
            {picks.map((pick, index) => (
              <li key={index} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {pick.item.name}
                  {pick.variant ? (
                    <span className="text-muted-foreground"> · {pick.variant.name}</span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums">{formatMoney(pick.unitPrice)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label="Quitar"
                    onClick={() => setPicks((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X className="size-3" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {menu === null && !error ? (
            <p className="text-muted-foreground p-4 text-sm">Cargando carta…</p>
          ) : (
            <MenuPickerView
              categories={menu?.categories ?? []}
              items={menu?.items ?? []}
              onPick={(pick) => setPicks((prev) => [...prev, pick])}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <span className="font-medium tabular-nums">{formatMoney(total)}</span>
          <Button disabled={picks.length === 0 || sending} onClick={() => void confirm()}>
            {sending ? "Agregando…" : `Agregar ${picks.length || ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
