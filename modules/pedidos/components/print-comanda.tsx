"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { getTicket, markPrinted, type Ticket } from "../caja-actions";
import { KitchenTicket } from "./kitchen-ticket";

/**
 * Pantalla de impresión de comanda.
 *
 * DECISIÓN QUE IMPORTA: sellar las líneas como impresas NO es automático. El navegador
 * no puede saber si el papel salió bien —la impresora pudo estar sin papel, atascada o
 * apagada— y `window.print()` resuelve igual si el usuario cancela el diálogo.
 *
 * Si se marcara automáticamente y la impresión falla, esas líneas dejarían de aparecer
 * como pendientes y Cocina nunca se enteraría de esa comida. El costo del error es que
 * un cliente no reciba su plato, así que se pregunta.
 *
 * El error contrario —marcar de menos— solo cuesta un papel repetido, y de eso Cocina sí
 * se da cuenta.
 */
export function PrintComanda({ orderId, onlyUnprinted }: { orderId: string; onlyUnprinted: boolean }) {
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sealing, setSealing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await getTicket(orderId, onlyUnprinted);
      if (cancelled) return;

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setTicket(result.ticket);

      // Se deja pintar la hoja antes de abrir el diálogo del sistema; si no, el
      // navegador puede capturar la página a medio renderizar.
      setTimeout(() => window.print(), 300);
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, onlyUnprinted]);

  async function seal() {
    setSealing(true);
    const result = await markPrinted(orderId);
    setSealing(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success(`${result.printed ?? 0} línea(s) marcadas como enviadas a Cocina.`);
    router.push("/caja");
  }

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

  if (!ticket) {
    return <p className="text-muted-foreground p-6 text-sm">Preparando la comanda…</p>;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* `print:hidden`: los controles no salen en el papel. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-semibold">
            {ticket.is_addition ? "Adición" : "Comanda"} · Mesa {ticket.order.table_label}
          </h1>
          <p className="text-muted-foreground text-sm">
            Si no se abrió el diálogo de impresión, usa el botón de abajo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            Imprimir otra vez
          </Button>
          <Button variant="ghost" onClick={() => router.back()}>
            Volver sin marcar
          </Button>
          <Button onClick={() => void seal()} disabled={sealing || ticket.items.length === 0}>
            {sealing ? "Marcando…" : "Salió bien, marcar como enviado"}
          </Button>
        </div>
      </div>

      <div className="border print:border-0">
        <KitchenTicket ticket={ticket} />
      </div>
    </div>
  );
}
