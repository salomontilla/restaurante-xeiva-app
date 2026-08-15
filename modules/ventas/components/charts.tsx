import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Gráficos del tablero de ventas.
 *
 * Construidos en HTML plano, sin librería de charts: son barras, y una dependencia de
 * ~100 KB para dibujar rectángulos no se paga sola. Además así funcionan en Server
 * Components y salen bien al imprimir.
 *
 * Los colores vienen de `.viz-root` (app/globals.css), validados contra la superficie
 * real de la app. No se eligen a ojo.
 */

/** Número grande. Cuando el dato ES el titular, no hay gráfico que valga más. */
export function StatTile({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className={cn("font-semibold", accent ? "text-3xl" : "text-2xl")}>{value}</span>
      {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </div>
  );
}

/**
 * Ventas por jornada.
 *
 * BARRAS, no líneas, y es una decisión del dominio: el restaurante abre solo domingos y
 * festivos. Una línea uniría dos domingos con una pendiente que atraviesa cinco días en
 * que el local estuvo cerrado, insinuando ventas que nunca existieron. Las jornadas son
 * categorías discretas, no una serie continua.
 */
export function JornadaBars({
  data,
}: {
  data: { date: string; label: string; total: number; orders: number }[];
}) {
  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">No hay ventas en este rango.</p>;
  }

  const max = Math.max(...data.map((d) => d.total));
  const best = data.reduce((a, b) => (b.total > a.total ? b : a));
  // Con muchas jornadas las etiquetas se pisan; se muestran salteadas.
  const labelEvery = data.length <= 14 ? 1 : Math.ceil(data.length / 10);

  return (
    <div className="viz-root flex flex-col gap-2">
      {/* pt-6 reserva el espacio de la etiqueta directa; la rejilla y las barras se
          alinean al área que queda debajo, no al contenedor completo. */}
      <div className="relative h-56 pt-6">
        {/* Rejilla recesiva: referencia, no protagonista. */}
        <div aria-hidden className="absolute inset-x-0 top-6 bottom-0">
          <div
            className="absolute inset-x-0 top-0 border-t"
            style={{ borderColor: "var(--viz-grid)" }}
          />
          <div
            className="absolute inset-x-0 top-1/2 border-t"
            style={{ borderColor: "var(--viz-grid)" }}
          />
        </div>

        <div className="relative flex h-full items-end gap-0.5">
        {data.map((point) => {
          const height = max > 0 ? (point.total / max) * 100 : 0;
          const isBest = point.date === best.date;

          return (
            <div key={point.date} className="group relative flex flex-1 flex-col justify-end">
              {/* Etiqueta directa solo en el máximo: un número sobre cada barra es ruido. */}
              {isBest ? (
                <span className="text-muted-foreground absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] whitespace-nowrap">
                  {formatMoney(point.total)}
                </span>
              ) : null}

              <div
                className="rounded-t transition-opacity group-hover:opacity-80"
                style={{
                  height: `${Math.max(height, 1)}%`,
                  backgroundColor: "var(--viz-series-1)",
                }}
              />

              {/* Tooltip solo con CSS: no hace falta JavaScript para esto. */}
              <div
                role="tooltip"
                className="bg-foreground text-background pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md px-2 py-1 text-xs whitespace-nowrap group-hover:block"
              >
                {point.label} · {formatMoney(point.total)} · {point.orders} pedidos
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <div
        aria-hidden
        className="border-t"
        style={{ borderColor: "var(--viz-baseline)" }}
      />

      <div className="flex gap-0.5">
        {data.map((point, index) => (
          <span
            key={point.date}
            className="flex-1 text-center text-[10px]"
            style={{ color: "var(--viz-muted)" }}
          >
            {index % labelEvery === 0 ? point.label : " "}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barras horizontales ordenadas: magnitud por identidad (platos, salones). */
export function RankedBars({
  data,
  emptyMessage = "Sin datos en este rango.",
}: {
  data: { key: string; label: string; sublabel?: string | null; value: number; note?: string }[];
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>;
  }

  const max = Math.max(...data.map((d) => d.value));

  return (
    <ul className="viz-root flex flex-col gap-2">
      {data.map((row) => (
        <li key={row.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {row.label}
              {row.sublabel ? (
                <span className="text-muted-foreground"> · {row.sublabel}</span>
              ) : null}
            </span>
            <span className="text-muted-foreground shrink-0 tabular-nums">
              {row.note ? `${row.note} · ` : ""}
              {formatMoney(row.value)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full"
              style={{
                width: `${max > 0 ? Math.max((row.value / max) * 100, 1) : 0}%`,
                backgroundColor: "var(--viz-series-1)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Reparto entre los dos métodos de pago.
 *
 * Dos series, así que lleva leyenda Y etiqueta directa: la identidad nunca depende solo
 * del color. No es una torta — comparar dos ángulos es más difícil que comparar dos
 * longitudes sobre la misma línea.
 */
export function PaymentSplit({ cash, transfer }: { cash: number; transfer: number }) {
  const total = cash + transfer;

  if (total === 0) {
    return <p className="text-muted-foreground text-sm">Sin pagos registrados.</p>;
  }

  const cashPct = (cash / total) * 100;

  return (
    <div className="viz-root flex flex-col gap-3">
      <div className="flex h-6 w-full gap-0.5 overflow-hidden rounded-md">
        <div style={{ width: `${cashPct}%`, backgroundColor: "var(--viz-series-1)" }} />
        <div style={{ width: `${100 - cashPct}%`, backgroundColor: "var(--viz-series-2)" }} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-3 rounded-sm"
            style={{ backgroundColor: "var(--viz-series-1)" }}
          />
          Efectivo
          <span className="font-medium tabular-nums">{formatMoney(cash)}</span>
          <span className="text-muted-foreground">({Math.round(cashPct)}%)</span>
        </span>

        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className="size-3 rounded-sm"
            style={{ backgroundColor: "var(--viz-series-2)" }}
          />
          Transferencia
          <span className="font-medium tabular-nums">{formatMoney(transfer)}</span>
          <span className="text-muted-foreground">({Math.round(100 - cashPct)}%)</span>
        </span>
      </div>
    </div>
  );
}
