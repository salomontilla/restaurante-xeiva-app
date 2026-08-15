"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

import { closeCheck, type PaymentEntry } from "../actions";

type Method = "efectivo" | "transferencia" | "mixto";

/**
 * Cobro de una subcuenta.
 *
 * "Mixto" no es un método de pago: son DOS pagos sobre la misma cuenta. Por eso la
 * pantalla lo trata como una tercera forma de capturar, pero lo que se manda al
 * servidor son dos entradas, una por método.
 *
 * No hay impuestos, propina ni descuentos (CLAUDE.md): el total es exactamente la suma
 * de las líneas, así que no hay ningún campo que ajuste el monto a cobrar.
 */
export function PaymentForm({
  checkId,
  total,
  onPaid,
}: {
  checkId: string;
  total: number;
  onPaid: (result: { orderClosed: boolean }) => void;
}) {
  const [method, setMethod] = useState<Method>("efectivo");
  const [cash, setCash] = useState<string>("");
  const [transfer, setTransfer] = useState<string>("");
  const [tendered, setTendered] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [sending, setSending] = useState(false);

  // En efectivo o transferencia puros, el monto ES el total: no hay nada que teclear ni
  // que se pueda equivocar. Solo el mixto pide repartir.
  const cashAmount = method === "mixto" ? Number(cash || 0) : method === "efectivo" ? total : 0;
  const transferAmount =
    method === "mixto" ? Number(transfer || 0) : method === "transferencia" ? total : 0;

  const sum = cashAmount + transferAmount;
  const missing = total - sum;

  const tenderedAmount = Number(tendered || 0);
  const change = tenderedAmount > 0 ? tenderedAmount - cashAmount : 0;

  const canSubmit =
    sum === total &&
    total > 0 &&
    (tenderedAmount === 0 || tenderedAmount >= cashAmount) &&
    !sending;

  async function submit() {
    const payments: PaymentEntry[] = [];

    if (cashAmount > 0) {
      payments.push({
        method: "efectivo",
        amount: cashAmount,
        tendered: tenderedAmount > 0 ? tenderedAmount : null,
      });
    }
    if (transferAmount > 0) {
      payments.push({
        method: "transferencia",
        amount: transferAmount,
        reference: reference.trim() || null,
      });
    }

    setSending(true);
    const result = await closeCheck(checkId, payments);
    setSending(false);

    if (!result.ok) {
      toast.error(
        result.expected !== undefined
          ? `${result.message} El total es ${formatMoney(result.expected)}.`
          : result.message,
      );
      return;
    }

    toast.success(
      result.orderClosed
        ? "Mesa cobrada y liberada."
        : `Cuenta cobrada. Faltan ${result.checksRemaining}.`,
    );
    onPaid({ orderClosed: result.orderClosed });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground text-sm">Total a cobrar</span>
        <span className="text-3xl font-bold tabular-nums">{formatMoney(total)}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(["efectivo", "transferencia", "mixto"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMethod(option)}
            className={cn(
              "h-12 rounded-lg border-2 text-sm font-medium capitalize",
              method === option ? "border-primary bg-primary/10" : "hover:bg-accent",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {method === "mixto" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cash">Efectivo</Label>
            <Input
              id="cash"
              type="number"
              min={0}
              step={1}
              value={cash}
              onChange={(e) => {
                const value = e.target.value;
                setCash(value);
                // Autocompletar el otro lado ahorra una cuenta mental en el momento de
                // más presión del servicio.
                setTransfer(value === "" ? "" : String(Math.max(total - Number(value), 0)));
              }}
              className="h-12 text-lg"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="transfer">Transferencia</Label>
            <Input
              id="transfer"
              type="number"
              min={0}
              step={1}
              value={transfer}
              onChange={(e) => setTransfer(e.target.value)}
              className="h-12 text-lg"
            />
          </div>
        </div>
      ) : null}

      {cashAmount > 0 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="tendered">Con cuánto paga (opcional)</Label>
          <Input
            id="tendered"
            type="number"
            min={0}
            step={1}
            value={tendered}
            onChange={(e) => setTendered(e.target.value)}
            placeholder={String(cashAmount)}
            className="h-12 text-lg"
          />
          {change > 0 ? (
            <p className="text-lg font-semibold">
              Vuelto: <span className="tabular-nums">{formatMoney(change)}</span>
            </p>
          ) : null}
          {tenderedAmount > 0 && tenderedAmount < cashAmount ? (
            <p className="text-destructive text-sm">
              No alcanza: faltan {formatMoney(cashAmount - tenderedAmount)}.
            </p>
          ) : null}
        </div>
      ) : null}

      {transferAmount > 0 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="reference">Referencia de la transferencia (opcional)</Label>
          <Input
            id="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="h-12"
            placeholder="Nequi, Bancolombia…"
          />
        </div>
      ) : null}

      {missing !== 0 ? (
        <p className={cn("text-sm font-medium", missing > 0 ? "text-destructive" : "text-amber-700")}>
          {missing > 0
            ? `Faltan ${formatMoney(missing)} por cubrir.`
            : `Sobran ${formatMoney(-missing)}: el pago no puede exceder el total.`}
        </p>
      ) : null}

      <Separator />

      <Button className="h-14 text-base" disabled={!canSubmit} onClick={() => void submit()}>
        {sending ? "Registrando…" : `Cobrar ${formatMoney(total)}`}
      </Button>
    </div>
  );
}
