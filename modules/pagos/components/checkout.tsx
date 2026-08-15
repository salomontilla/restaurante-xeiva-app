"use client";

import { ChevronLeft, Printer, Split } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { useOrderDetail } from "@/modules/pedidos/use-order";

import { PaymentForm } from "./payment-form";
import { SplitEditor } from "./split-editor";

/**
 * Cierre de mesa.
 *
 * El caso normal es una sola cuenta: se ve el total y se cobra. Dividir es la excepción
 * y por eso está detrás de un botón, no en el camino principal.
 *
 * La mesa se libera sola cuando se paga la ÚLTIMA subcuenta — no hay ningún botón de
 * "liberar mesa" porque no hay nada que liberar: "ocupada" es un dato derivado de que
 * exista un pedido abierto.
 */
export function Checkout({ tableId }: { tableId: string }) {
  const router = useRouter();
  const { detail, error, refetch } = useOrderDetail(tableId);
  const [splitting, setSplitting] = useState(false);
  const [payingCheckId, setPayingCheckId] = useState<string | null>(null);

  if (detail === null) {
    return <p className="text-muted-foreground p-4 text-sm">Cargando mesa…</p>;
  }

  const { table, order, items, checks } = detail;
  const live = items.filter((item) => item.voided_at === null);

  if (!order) {
    return (
      <div className="flex flex-col items-start gap-3 p-4">
        <p className="text-sm">Esta mesa no tiene un pedido abierto.</p>
        <Button variant="outline" render={<Link href="/caja" />}>
          Volver a las mesas
        </Button>
      </div>
    );
  }

  const anyPaid = checks.some((check) => check.paid_at !== null);
  const pendientes = checks.filter((check) => check.paid_at === null);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-1 gap-1"
          render={<Link href={`/caja/mesa/${tableId}`} />}
        >
          <ChevronLeft className="size-4" />
          Volver al pedido
        </Button>
        <h1 className="text-xl font-semibold">
          Cobrar mesa {table?.table_label}
          <span className="text-muted-foreground ml-2 text-base font-normal">
            {table?.dining_room_name}
          </span>
        </h1>
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {splitting ? (
        <Card>
          <CardContent className="pt-6">
            <SplitEditor
              orderId={order.id}
              items={live}
              checks={checks}
              onCancel={() => setSplitting(false)}
              onDone={async () => {
                setSplitting(false);
                await refetch();
              }}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Dividir solo tiene sentido antes de cobrar nada: una vez pagada una
              cuenta, sus líneas quedan selladas y el servidor rechaza moverlas. */}
          {!anyPaid && live.length > 1 ? (
            <Button variant="outline" className="h-12 self-start" onClick={() => setSplitting(true)}>
              <Split className="size-4" />
              {checks.length > 1 ? "Ajustar división" : "Dividir cuenta"}
            </Button>
          ) : null}

          {checks.map((check) => {
            const checkItems = live.filter((item) => item.check_id === check.id);
            const paid = check.paid_at !== null;

            return (
              <Card key={check.id} className={paid ? "opacity-70" : undefined}>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {checks.length > 1 ? `Cuenta ${check.seq}` : "Cuenta"}
                    {paid ? <Badge variant="secondary">Pagada</Badge> : null}
                  </CardTitle>
                  <span className="text-xl font-semibold tabular-nums">
                    {formatMoney(check.total)}
                  </span>
                </CardHeader>

                <CardContent className="flex flex-col gap-3">
                  <ul className="text-sm">
                    {checkItems.map((item) => (
                      <li key={item.id} className="flex justify-between gap-2 py-0.5">
                        <span className="min-w-0 truncate">
                          {item.qty} × {item.item_name}
                          {item.variant_name ? (
                            <span className="text-muted-foreground"> · {item.variant_name}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums">{formatMoney(item.line_total)}</span>
                      </li>
                    ))}
                  </ul>

                  {paid ? (
                    <Button
                      variant="outline"
                      className="self-start"
                      render={<Link href={`/imprimir/recibo/${check.id}`} />}
                    >
                      <Printer className="size-4" />
                      Imprimir recibo
                    </Button>
                  ) : payingCheckId === check.id ? (
                    <PaymentForm
                      checkId={check.id}
                      total={Number(check.total)}
                      onPaid={async ({ orderClosed }) => {
                        setPayingCheckId(null);
                        if (orderClosed) {
                          router.push("/caja");
                          return;
                        }
                        await refetch();
                      }}
                    />
                  ) : (
                    <Button
                      className="h-12 self-start"
                      disabled={Number(check.total) === 0}
                      onClick={() => setPayingCheckId(check.id)}
                    >
                      Cobrar {formatMoney(check.total)}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {pendientes.length === 0 && checks.length > 0 ? (
            <p className="text-muted-foreground text-sm">
              Todas las cuentas están pagadas. La mesa ya quedó libre.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
