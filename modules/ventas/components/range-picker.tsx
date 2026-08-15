import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Selector de rango, expresado en JORNADAS y no en días.
 *
 * "Últimos 30 días" traería cuatro domingos y veintiséis días vacíos. Lo que el dueño
 * quiere ver es "las últimas 4 jornadas". El rango por fechas queda disponible detrás,
 * para cuando de verdad hace falta un periodo concreto.
 *
 * Es un formulario GET normal: sin JavaScript, el estado vive en la URL y la página se
 * puede compartir o recargar sin perder nada.
 */
const PRESETS = [
  { count: 1, label: "Última jornada" },
  { count: 4, label: "Últimas 4" },
  { count: 12, label: "Últimas 12" },
];

export function RangePicker({
  preset,
  from,
  to,
  totalJornadas,
}: {
  preset: number | null;
  from: string;
  to: string;
  totalJornadas: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.filter((option) => option.count <= Math.max(totalJornadas, 1)).map((option) => (
          <Link
            key={option.count}
            href={`/admin/ventas?ultimas=${option.count}`}
            className={cn(
              "h-9 rounded-md border px-3 text-sm leading-9 font-medium",
              preset === option.count
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent",
            )}
          >
            {option.label}
          </Link>
        ))}

        {totalJornadas > 0 ? (
          <Link
            href={`/admin/ventas?ultimas=${totalJornadas}`}
            className={cn(
              "h-9 rounded-md border px-3 text-sm leading-9 font-medium",
              preset === totalJornadas ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            Todo ({totalJornadas})
          </Link>
        ) : null}
      </div>

      <form method="get" action="/admin/ventas" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Desde
          <input
            type="date"
            name="desde"
            defaultValue={from}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Hasta
          <input
            type="date"
            name="hasta"
            defaultValue={to}
            className="border-input bg-background h-9 rounded-md border px-2 text-sm"
          />
        </label>
        <Button type="submit" variant="outline" className="h-9">
          Aplicar
        </Button>
      </form>
    </div>
  );
}
