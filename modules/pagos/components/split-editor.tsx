"use client";

import { Scissors } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import type { OrderCheckRow, OrderItemRow } from "@/modules/pedidos/use-order";

import { splitLine, splitOrder } from "../actions";

/**
 * División de la cuenta por platos.
 *
 * La hace CAJA al momento de cobrar: el mesero siempre toma el pedido completo. Cada
 * línea se toca para moverla de cuenta — números, no arrastrar: con el dedo o con prisa,
 * el drag & drop falla y es más lento.
 *
 * Si dos personas comparten un plato, "Dividir" parte la línea por cantidad, porque un
 * plato pertenece a UNA sola cuenta.
 */
export function SplitEditor({
  orderId,
  items,
  checks,
  onCancel,
  onDone,
}: {
  orderId: string;
  items: OrderItemRow[];
  checks: OrderCheckRow[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const seqByCheckId = new Map(checks.map((check) => [check.id, check.seq]));

  const [assignment, setAssignment] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((item) => [item.id, seqByCheckId.get(item.check_id) ?? 1])),
  );
  const [count, setCount] = useState(Math.max(checks.length, 2));
  const [saving, setSaving] = useState(false);
  const [busyLine, setBusyLine] = useState<string | null>(null);

  const seqs = Array.from({ length: count }, (_, i) => i + 1);

  function totalOf(seq: number): number {
    return items
      .filter((item) => assignment[item.id] === seq)
      .reduce((sum, item) => sum + Number(item.line_total ?? 0), 0);
  }

  async function save() {
    setSaving(true);
    const result = await splitOrder(
      orderId,
      seqs.map((seq) => ({
        seq,
        itemIds: items.filter((item) => assignment[item.id] === seq).map((item) => item.id),
      })),
    );
    setSaving(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success("Cuenta dividida.");
    onDone();
  }

  async function divideLine(item: OrderItemRow) {
    setBusyLine(item.id);
    // Se parte una unidad: es el caso real (dos personas comparten un plato). Para
    // cantidades mayores se repite la operación.
    const result = await splitLine(item.id, 1);
    setBusyLine(null);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    // La línea nueva la trae el refetch del padre.
    onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Dividir la cuenta</h2>
          <p className="text-muted-foreground text-sm">
            Toca el número para mover cada plato a la cuenta que le corresponde.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCount((n) => n + 1)}>
          Agregar cuenta
        </Button>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {item.qty} × {item.item_name}
                {item.variant_name ? (
                  <span className="text-muted-foreground"> · {item.variant_name}</span>
                ) : null}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {formatMoney(item.line_total)}
              </p>
            </div>

            {item.qty > 1 ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busyLine === item.id}
                onClick={() => void divideLine(item)}
                title="Separar una unidad para otra cuenta"
              >
                <Scissors className="size-4" />
                Separar 1
              </Button>
            ) : null}

            <div className="flex gap-1">
              {seqs.map((seq) => (
                <button
                  key={seq}
                  type="button"
                  onClick={() => setAssignment((prev) => ({ ...prev, [item.id]: seq }))}
                  className={cn(
                    "size-10 rounded-md border-2 font-semibold",
                    assignment[item.id] === seq
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent",
                  )}
                >
                  {seq}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <Separator />

      <div className="flex flex-wrap gap-3">
        {seqs.map((seq) => (
          <div key={seq} className="rounded-lg border px-3 py-2">
            <p className="text-muted-foreground text-xs">Cuenta {seq}</p>
            <p className="font-semibold tabular-nums">{formatMoney(totalOf(seq))}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Guardando…" : "Guardar división"}
        </Button>
      </div>
    </div>
  );
}
