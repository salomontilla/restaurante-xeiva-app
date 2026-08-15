"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/money";
import { db } from "@/modules/offline/db";
import { useOffline } from "@/modules/offline/offline-provider";

import { changeQty, draftTotal, sendDraft, setItemNote, syncOrderFromServer } from "../drafts";
import { NoteDialog } from "./note-dialog";

/**
 * El pedido de una mesa.
 *
 * Se renderiza desde IndexedDB, nunca desde una respuesta de red. Por eso no hay
 * spinners de carga: lo que el mesero escribió está en pantalla en el mismo momento en
 * que lo toca, con señal o sin ella.
 */
export function OrderScreen({
  tableId,
  onAddItems,
  onBack,
}: {
  tableId: string;
  onAddItems: (orderId: string) => void;
  onBack: () => void;
}) {
  const { status } = useOffline();

  const draft = useLiveQuery(
    async () => {
      const drafts = await db.drafts.where("tableId").equals(tableId).toArray();
      return drafts.find((d) => !d.closed) ?? null;
    },
    [tableId],
    undefined,
  );

  const orderId = draft?.orderId;

  // Al entrar, se trae del servidor lo que Caja pudo haber agregado o anulado. Si no hay
  // señal no pasa nada: se sigue viendo el borrador local.
  useEffect(() => {
    if (orderId) void syncOrderFromServer(orderId);
  }, [orderId]);

  if (draft === undefined) {
    return <p className="text-muted-foreground p-4 text-sm">Abriendo mesa…</p>;
  }

  if (draft === null) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm">Esta mesa ya no tiene un pedido abierto.</p>
        <Button onClick={onBack} variant="outline" className="self-start">
          Volver a las mesas
        </Button>
      </div>
    );
  }

  const pending = draft.items.filter((item) => item.syncedAt === null);
  const sent = draft.items.filter((item) => item.syncedAt !== null);
  const total = draftTotal(draft);

  async function onSend() {
    if (!draft) return;
    const { queued } = await sendDraft(draft.orderId);

    // El mensaje es distinto según haya señal, porque la expectativa del mesero es
    // distinta: con señal ya está en Caja; sin señal está guardado y va a salir solo.
    toast.success(
      queued
        ? status === "online"
          ? "Pedido enviado a Caja."
          : "Guardado. Se envía solo cuando vuelva la señal."
        : "No hay nada nuevo por enviar.",
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col gap-4 p-4 pb-40">
        <div>
          <h1 className="text-xl font-semibold">Mesa {draft.tableLabel}</h1>
          <p className="text-muted-foreground text-sm">{draft.roomName}</p>
        </div>

        {draft.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Todavía no has agregado nada a esta mesa.
          </p>
        ) : null}

        {pending.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Por enviar</h2>
            <ul className="flex flex-col gap-2">
              {pending.map((item) => (
                <li
                  key={item.id}
                  className="border-primary/40 flex items-center gap-2 rounded-lg border-2 border-dashed p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.itemName}</p>
                    {item.variantName ? (
                      <p className="text-muted-foreground text-xs">{item.variantName}</p>
                    ) : null}
                    <p className="text-muted-foreground text-xs">
                      {formatMoney(item.unitPrice)} c/u
                    </p>
                    {item.note ? (
                      <p className="mt-1 text-xs font-medium italic">“{item.note}”</p>
                    ) : null}
                    <NoteDialog
                      itemName={item.itemName}
                      note={item.note}
                      triggerLabel={item.note ? "Cambiar nota" : "Nota"}
                      onSave={(note) => setItemNote(draft.orderId, item.id, note)}
                    />
                  </div>

                  {/* Botones de 44px: se tocan de pie, con el restaurante lleno. */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-11"
                      aria-label="Quitar uno"
                      onClick={() => void changeQty(draft.orderId, item.id, item.qty - 1)}
                    >
                      {item.qty === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                    </Button>
                    <span className="w-8 text-center text-lg font-semibold">{item.qty}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-11"
                      aria-label="Agregar uno"
                      onClick={() => void changeQty(draft.orderId, item.id, item.qty + 1)}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {sent.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Ya en Caja</h2>
            <ul className="flex flex-col gap-1">
              {sent.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 py-1 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    {item.qty} × {item.itemName}
                    {item.variantName ? (
                      <span className="text-muted-foreground"> · {item.variantName}</span>
                    ) : null}
                  </span>
                  {item.printedAt ? (
                    <Badge variant="secondary" className="shrink-0">
                      En cocina
                    </Badge>
                  ) : null}
                  <span className="shrink-0 tabular-nums">
                    {formatMoney(item.unitPrice * item.qty)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {draft.items.length > 0 ? (
          <>
            <Separator />
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMoney(total)}</span>
            </div>
          </>
        ) : null}
      </div>

      {/* Barra fija: las dos únicas acciones de esta pantalla, siempre al alcance del pulgar. */}
      <div className="bg-background fixed inset-x-0 bottom-0 border-t p-4">
        <div className="mx-auto flex max-w-2xl gap-3">
          <Button
            variant="outline"
            className="h-14 flex-1 text-base"
            onClick={() => onAddItems(draft.orderId)}
          >
            Agregar platos
          </Button>
          <Button
            className="h-14 flex-1 text-base"
            disabled={pending.length === 0}
            onClick={() => void onSend()}
          >
            Enviar {pending.length > 0 ? `(${pending.length})` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
