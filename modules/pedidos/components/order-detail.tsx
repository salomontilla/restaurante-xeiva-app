"use client";

import { ChevronLeft, Minus, Plus, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

import { changeItemNote, changeItemQty, deleteItem, voidItem } from "../caja-actions";
import { useOrderDetail } from "../use-order";
import { AddItemsDialog } from "./add-items-dialog";
import { NoteDialog } from "./note-dialog";

/**
 * Detalle de una mesa desde Caja.
 *
 * Las dos reglas del dominio que gobiernan esta pantalla:
 *
 *   · Una línea que AÚN NO se imprimió se puede editar y borrar: no ha salido de aquí.
 *   · Una línea YA IMPRESA está en Cocina. No se borra, se ANULA: deja de cobrarse pero
 *     queda registrada, porque esa comida se preparó.
 */
export function OrderDetail({ tableId }: { tableId: string }) {
  const { detail, error, refetch } = useOrderDetail(tableId);
  const [busy, setBusy] = useState<string | null>(null);

  if (detail === null) {
    return <p className="text-muted-foreground p-4 text-sm">Cargando mesa…</p>;
  }

  const { table, order, items, checks } = detail;

  const live = items.filter((item) => item.voided_at === null);
  const voided = items.filter((item) => item.voided_at !== null);
  const unprinted = live.filter((item) => item.printed_at === null);

  async function run(key: string, action: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    const result = await action();
    setBusy(null);

    if (!result.ok) toast.error(result.message ?? "No se pudo completar la operación.");
    await refetch();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 mb-1 gap-1"
            render={<Link href="/caja" />}
          >
            <ChevronLeft className="size-4" />
            Mesas
          </Button>
          <h1 className="text-xl font-semibold">
            Mesa {table?.table_label ?? "—"}
            <span className="text-muted-foreground ml-2 text-base font-normal">
              {table?.dining_room_name}
            </span>
          </h1>
          <p className="text-muted-foreground text-sm">
            {table?.assigned_waiter_name ? `Atiende ${table.assigned_waiter_name}` : "Sin mesero"}
            {order ? ` · ${order.status}` : ""}
          </p>
        </div>

        {order ? (
          <div className="text-right">
            <p className="text-2xl font-semibold tabular-nums">{formatMoney(order.total)}</p>
            {checks.length > 1 ? (
              <Badge variant="secondary">{checks.length} cuentas</Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {!order ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8">
            <p className="text-muted-foreground text-sm">
              Esta mesa está libre. Puedes abrirle un pedido desde aquí si el cliente pide
              en la barra.
            </p>
            <AddItemsDialog tableId={tableId} orderId={null} onDone={() => void refetch()} />
          </CardContent>
        </Card>
      ) : null}

      {order ? (
        <>
          {/* Lo pendiente de imprimir va primero: es lo que Cocina está esperando. */}
          {unprinted.length > 0 ? (
            <Card className="border-primary border-2">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <span className="text-sm font-medium">
                  {unprinted.length} línea(s) sin llevar a Cocina
                </span>
                <Button render={<Link href={`/imprimir/comanda/${order.id}`} />}>
                  <Printer className="size-4" />
                  {order.printed_at ? "Imprimir adición" : "Imprimir comanda"}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <ul className="flex flex-col gap-2">
            {live.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3",
                  item.printed_at === null && "border-primary/40 border-dashed",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {item.item_name}
                    {item.variant_name ? (
                      <span className="text-muted-foreground"> · {item.variant_name}</span>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {formatMoney(item.unit_price)} c/u
                    {item.printed_at ? " · en cocina" : " · sin imprimir"}
                  </p>
                  {item.note ? <p className="text-xs italic">“{item.note}”</p> : null}
                  {item.printed_at === null ? (
                    <NoteDialog
                      itemName={item.item_name}
                      note={item.note}
                      triggerLabel={item.note ? "Cambiar nota" : "Nota"}
                      onSave={(note) =>
                        run(`nota-${item.id}`, () => changeItemNote(item.id, note))
                      }
                    />
                  ) : null}
                </div>

                {item.printed_at === null ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      aria-label="Quitar uno"
                      disabled={busy === item.id}
                      onClick={() =>
                        void run(item.id, () => changeItemQty(item.id, item.qty - 1))
                      }
                    >
                      {item.qty === 1 ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
                    </Button>
                    <span className="w-7 text-center font-semibold">{item.qty}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      aria-label="Agregar uno"
                      disabled={busy === item.id}
                      onClick={() =>
                        void run(item.id, () => changeItemQty(item.id, item.qty + 1))
                      }
                    >
                      <Plus className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <span className="w-7 text-center font-semibold">{item.qty}</span>
                )}

                <span className="w-24 shrink-0 text-right font-medium tabular-nums">
                  {formatMoney(item.line_total)}
                </span>

                {item.printed_at ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === item.id}
                    onClick={() => void run(item.id, () => voidItem(item.id))}
                  >
                    Anular
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy === item.id}
                    onClick={() => void run(item.id, () => deleteItem(item.id))}
                  >
                    Quitar
                  </Button>
                )}
              </li>
            ))}
          </ul>

          {live.length === 0 ? (
            <p className="text-muted-foreground text-sm">Este pedido no tiene líneas.</p>
          ) : null}

          {voided.length > 0 ? (
            <details className="text-muted-foreground text-sm">
              <summary className="cursor-pointer">{voided.length} línea(s) anuladas</summary>
              <ul className="mt-2 flex flex-col gap-1">
                {voided.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2 line-through">
                    <span>
                      {item.qty} × {item.item_name}
                    </span>
                    <span className="tabular-nums">{formatMoney(item.line_total)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <AddItemsDialog
              tableId={tableId}
              orderId={order.id}
              onDone={() => void refetch()}
            />

            <div className="flex items-center gap-2">
              {order.printed_at ? (
                <Button
                  variant="outline"
                  className="h-12"
                  render={<Link href={`/imprimir/comanda/${order.id}?todo=1`} />}
                >
                  <Printer className="size-4" />
                  Reimprimir todo
                </Button>
              ) : null}

              <Button
                className="h-12"
                disabled={live.length === 0}
                render={<Link href={`/caja/mesa/${tableId}/cerrar`} />}
              >
                Cobrar {formatMoney(order.total)}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
