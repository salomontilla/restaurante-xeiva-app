"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { getReceipt, type Receipt as ReceiptData } from "../actions";
import { Receipt } from "./receipt";

/**
 * Pantalla de impresión del recibo.
 *
 * A diferencia de la comanda, aquí no hay nada que "sellar": el recibo se puede
 * reimprimir cuantas veces haga falta y no cambia nada en la base. Por eso solo hay
 * botones de imprimir y volver.
 */
export function PrintRecibo({ checkId }: { checkId: string }) {
  const router = useRouter();
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await getReceipt(checkId);
      if (cancelled) return;

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setReceipt(result.receipt);
      // Se deja pintar antes de abrir el diálogo del sistema.
      setTimeout(() => window.print(), 300);
    })();

    return () => {
      cancelled = true;
    };
  }, [checkId]);

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert" className="text-destructive">
          {error}
        </p>
        <Button variant="outline" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  if (!receipt) {
    return <p className="text-muted-foreground p-6 text-sm">Preparando el recibo…</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="font-semibold">Recibo · Mesa {receipt.order.table_label}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            Imprimir otra vez
          </Button>
          <Button onClick={() => router.push("/caja")}>Volver a las mesas</Button>
        </div>
      </div>

      <div className="border print:border-0">
        <Receipt receipt={receipt} />
      </div>
    </div>
  );
}
