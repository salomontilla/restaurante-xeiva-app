"use client";

import { ArrowDownLeft, ArrowUpRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

import {
  addCashMovement,
  closeCashSession,
  getCashSession,
  openCashSession,
  type CashSessionDetail,
} from "../actions";

/**
 * Arqueo de caja.
 *
 * Mientras la caja está abierta, el esperado se calcula EN VIVO —el cajero necesita
 * verlo actualizado—. Al cerrar se congela: si mañana se anula una línea, el descuadre
 * de este arqueo no cambia. Se deriva lo actual, se congela lo histórico.
 */
export function ArqueoPanel() {
  const [detail, setDetail] = useState<CashSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await getCashSession();
    setLoading(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setDetail(result.detail);
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(initial);
  }, [refresh]);

  if (loading) {
    return <p className="text-muted-foreground text-sm">Cargando…</p>;
  }

  const session = detail?.session ?? null;

  if (!session || session.closed_at) {
    return <AbrirCaja onDone={refresh} ultimoCierre={session} />;
  }

  return <CajaAbierta detail={detail!} onDone={refresh} />;
}

function AbrirCaja({
  onDone,
  ultimoCierre,
}: {
  onDone: () => Promise<void>;
  ultimoCierre: CashSessionDetail["session"];
}) {
  const [base, setBase] = useState("");
  const [pending, setPending] = useState(false);

  async function abrir() {
    setPending(true);
    const result = await openCashSession(Number(base || 0));
    setPending(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Caja abierta.");
    await onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Abrir caja</CardTitle>
        <CardDescription>
          Anota con cuánta plata empiezas el día. Se cuenta como parte del cajón al cerrar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {ultimoCierre?.closed_at ? (
          <p className="text-muted-foreground text-sm">
            El último arqueo se cerró el{" "}
            {new Date(ultimoCierre.closed_at).toLocaleDateString("es-CO")} con{" "}
            {formatMoney(ultimoCierre.counted_cash)} contados.
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="base">Base (fondo para vueltos)</Label>
          <Input
            id="base"
            type="number"
            min={0}
            step={1}
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="100000"
            className="h-12 text-lg"
          />
        </div>

        <Button className="h-12 self-start" onClick={() => void abrir()} disabled={pending}>
          {pending ? "Abriendo…" : "Abrir caja"}
        </Button>
      </CardContent>
    </Card>
  );
}

function CajaAbierta({
  detail,
  onDone,
}: {
  detail: CashSessionDetail;
  onDone: () => Promise<void>;
}) {
  const session = detail.session!;
  const esperado = Number(detail.live_expected_cash);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              Caja abierta
              <Badge variant="secondary">
                desde las{" "}
                {new Date(session.opened_at).toLocaleTimeString("es-CO", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Badge>
            </CardTitle>
            <CardDescription>
              Abrió {detail.opened_by_name} con {formatMoney(session.opening_float)} de base.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void onDone()} aria-label="Actualizar">
            <RefreshCw className="size-4" />
          </Button>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Fila label="Base" value={formatMoney(session.opening_float)} />
            <Fila label={`Ventas en efectivo (${detail.payments_count} pagos)`} value={formatMoney(detail.sales_cash)} />
            {detail.movements_in > 0 ? (
              <Fila label="Ingresos" value={`+ ${formatMoney(detail.movements_in)}`} />
            ) : null}
            {detail.movements_out > 0 ? (
              <Fila label="Retiros" value={`− ${formatMoney(detail.movements_out)}`} />
            ) : null}
          </dl>

          <Separator />

          <div className="flex items-baseline justify-between">
            <span className="font-medium">Debería haber en el cajón</span>
            <span className="text-2xl font-bold tabular-nums">{formatMoney(esperado)}</span>
          </div>

          {detail.sales_transfers > 0 ? (
            <p className="text-muted-foreground text-sm">
              Además, {formatMoney(detail.sales_transfers)} en transferencias (no van al cajón).
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Movimientos detail={detail} onDone={onDone} />
      <CerrarCaja detail={detail} esperado={esperado} onDone={onDone} />
    </div>
  );
}

function Fila({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Retiros e ingresos durante la jornada.
 *
 * Es lo que más descuadra arqueos en la vida real: pagarle al de las gaseosas con plata
 * del cajón y no anotarlo hace que al final falte dinero sin explicación.
 */
function Movimientos({
  detail,
  onDone,
}: {
  detail: CashSessionDetail;
  onDone: () => Promise<void>;
}) {
  const [kind, setKind] = useState<"retiro" | "ingreso">("retiro");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  async function registrar() {
    setPending(true);
    const result = await addCashMovement(kind, Number(amount || 0), reason);
    setPending(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    setAmount("");
    setReason("");
    toast.success(kind === "retiro" ? "Retiro registrado." : "Ingreso registrado.");
    await onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Movimientos del cajón</CardTitle>
        <CardDescription>
          Plata que entra o sale sin ser una venta: pagarle a un proveedor, mandar por hielo.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {detail.movements.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {detail.movements.map((movement) => (
              <li key={movement.id} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  {movement.kind === "retiro" ? (
                    <ArrowUpRight className="text-destructive size-4 shrink-0" />
                  ) : (
                    <ArrowDownLeft className="size-4 shrink-0 text-green-700" />
                  )}
                  <span className="truncate">{movement.reason}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {movement.kind === "retiro" ? "−" : "+"} {formatMoney(movement.amount)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1">
            {(["retiro", "ingreso"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setKind(option)}
                className={cn(
                  "h-10 rounded-md border px-3 text-sm capitalize",
                  kind === option ? "border-primary bg-primary/10" : "hover:bg-accent",
                )}
              >
                {option}
              </button>
            ))}
          </div>

          <Input
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Monto"
            className="h-10 w-32"
          />
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo"
            className="h-10 flex-1"
          />
          <Button
            variant="outline"
            className="h-10"
            disabled={pending || !amount || !reason.trim()}
            onClick={() => void registrar()}
          >
            Registrar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CerrarCaja({
  detail,
  esperado,
  onDone,
}: {
  detail: CashSessionDetail;
  esperado: number;
  onDone: () => Promise<void>;
}) {
  const session = detail.session!;
  const [counted, setCounted] = useState("");
  const [countedTransfers, setCountedTransfers] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmOpenOrders, setConfirmOpenOrders] = useState(false);

  const countedNumber = Number(counted || 0);
  const diferencia = counted === "" ? null : countedNumber - esperado;

  async function cerrar() {
    setPending(true);
    const result = await closeCashSession({
      sessionId: session.id,
      countedCash: countedNumber,
      countedTransfers: countedTransfers === "" ? null : Number(countedTransfers),
      notes: notes.trim() || null,
      allowOpenOrders: confirmOpenOrders,
    });
    setPending(false);

    if (!result.ok) {
      if (result.code === "OPEN_ORDERS") {
        setConfirmOpenOrders(true);
        toast.warning(
          `Quedan ${result.openOrders} mesa(s) sin cobrar. Toca cerrar otra vez para hacerlo de todas formas.`,
        );
        return;
      }
      toast.error(result.message);
      return;
    }

    toast.success(
      result.difference === 0
        ? "Caja cerrada y cuadrada."
        : `Caja cerrada con una diferencia de ${formatMoney(Math.abs(result.difference))}.`,
    );
    await onDone();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cerrar caja</CardTitle>
        <CardDescription>
          Cuenta todo lo que hay en el cajón, incluida la base.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="counted">Efectivo contado</Label>
          <Input
            id="counted"
            type="number"
            min={0}
            step={1}
            value={counted}
            onChange={(e) => setCounted(e.target.value)}
            className="h-14 text-2xl"
            autoComplete="off"
          />
        </div>

        {diferencia !== null && diferencia !== 0 ? (
          <div
            className={cn(
              "rounded-md p-3 text-sm",
              diferencia < 0 ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-900",
            )}
          >
            {diferencia < 0 ? "Faltan " : "Sobran "}
            <strong className="tabular-nums">{formatMoney(Math.abs(diferencia))}</strong>. Explica
            por qué antes de cerrar.
          </div>
        ) : null}

        {diferencia === 0 ? (
          <p className="text-sm font-medium text-green-700">La caja cuadra exactamente.</p>
        ) : null}

        {detail.sales_transfers > 0 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="transfers">
              Transferencias verificadas en el banco (opcional)
            </Label>
            <Input
              id="transfers"
              type="number"
              min={0}
              step={1}
              value={countedTransfers}
              onChange={(e) => setCountedTransfers(e.target.value)}
              placeholder={String(detail.sales_transfers)}
              className="h-12"
            />
            {detail.transfers.length > 0 ? (
              <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
                {detail.transfers.map((transfer, index) => (
                  <li key={index} className="flex justify-between gap-2">
                    <span>{transfer.reference ?? "sin referencia"}</span>
                    <span className="tabular-nums">{formatMoney(transfer.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">
            Observaciones{diferencia !== null && diferencia !== 0 ? " (obligatorio)" : " (opcional)"}
          </Label>
          <Textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Se le pagó al de las gaseosas, faltó registrar…"
          />
        </div>

        <Button
          className="h-14 text-base"
          disabled={pending || counted === ""}
          onClick={() => void cerrar()}
        >
          {pending
            ? "Cerrando…"
            : confirmOpenOrders
              ? "Cerrar de todas formas"
              : "Cerrar caja"}
        </Button>
      </CardContent>
    </Card>
  );
}
