import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import {
  JornadaBars,
  PaymentSplit,
  RankedBars,
  StatTile,
} from "@/modules/ventas/components/charts";
import { RangePicker } from "@/modules/ventas/components/range-picker";
import {
  formatJornada,
  formatJornadaShort,
  getSalesByWaiter,
  getSalesSummary,
  listJornadas,
  resolveRange,
} from "@/modules/ventas/queries";

export const metadata = { title: "Ventas · Xeiva" };

export default async function VentasPage({ searchParams }: PageProps<"/admin/ventas">) {
  const params = await searchParams;

  const jornadas = await listJornadas();
  const { from, to, preset } = resolveRange(jornadas, {
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
    ultimas: typeof params.ultimas === "string" ? params.ultimas : undefined,
  });

  const [summary, byWaiter] = await Promise.all([
    getSalesSummary(from, to),
    getSalesByWaiter(from, to),
  ]);

  const { totals, by_day, by_dining_room, top_items } = summary;
  // El promedio se calcula sobre el rango completo, no promediando los promedios
  // diarios: una jornada de 3 pedidos pesaría igual que una de 60.
  const avgTicket = totals.orders_count > 0 ? totals.gross_total / totals.orders_count : 0;

  // El RPC devuelve las jornadas de la más antigua a la más reciente; el gráfico las
  // lee en ese mismo orden, de izquierda a derecha.
  const chartData = by_day.map((day) => ({
    date: day.business_date,
    label: formatJornadaShort(day.business_date),
    total: Number(day.gross_total),
    orders: day.orders_count,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-xl font-semibold">Ventas</h1>
          <p className="text-muted-foreground text-sm">
            {jornadas.length === 0
              ? "Todavía no hay jornadas con ventas cerradas."
              : `${formatJornada(from)} — ${formatJornada(to)}`}
          </p>
        </div>

        <RangePicker preset={preset} from={from} to={to} totalJornadas={jornadas.length} />
      </div>

      {jornadas.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            Los reportes se construyen a partir de pedidos <strong>cerrados y pagados</strong>.
            En cuanto Caja cobre la primera mesa, aparecerán aquí.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Ventas" value={formatMoney(totals.gross_total)} accent />
            <StatTile label="Pedidos" value={String(totals.orders_count)} />
            <StatTile label="Ticket promedio" value={formatMoney(avgTicket)} />
            <StatTile
              label="Jornadas"
              value={String(by_day.length)}
              hint={by_day.length === 1 ? "una jornada" : "con ventas en el rango"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Ventas por jornada</CardTitle>
              <CardDescription>
                Cada barra es un día de servicio. El restaurante abre domingos y festivos,
                así que las jornadas no son consecutivas.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <JornadaBars data={chartData} />

              {/* Vista de tabla: los mismos datos sin depender de leer un gráfico. */}
              <details className="text-sm">
                <summary className="text-muted-foreground cursor-pointer">
                  Ver como tabla
                </summary>
                <Table className="mt-2">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jornada</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Efectivo</TableHead>
                      <TableHead className="text-right">Transferencia</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {by_day.map((day) => (
                      <TableRow key={day.business_date}>
                        <TableCell className="capitalize">
                          {formatJornada(day.business_date)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {day.orders_count}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(day.cash_total)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(day.transfer_total)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoney(day.gross_total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </details>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Cómo pagaron</CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentSplit
                  cash={Number(totals.cash_total)}
                  transfer={Number(totals.transfer_total)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Por salón</CardTitle>
              </CardHeader>
              <CardContent>
                <RankedBars
                  data={by_dining_room.map((room) => ({
                    key: room.dining_room_name,
                    label: room.dining_room_name,
                    value: Number(room.total),
                    note: `${room.orders_count} pedidos`,
                  }))}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Platos más vendidos</CardTitle>
              <CardDescription>
                Ordenados por cantidad. Es el insumo del análisis de compras que contempla
                el proyecto a futuro.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RankedBars
                data={top_items.map((item) => ({
                  key: `${item.item_name}-${item.variant_name ?? ""}`,
                  label: item.item_name,
                  sublabel: item.variant_name,
                  value: Number(item.total),
                  note: `${item.qty_sold} und.`,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Por mesero</CardTitle>
            </CardHeader>
            <CardContent>
              {byWaiter.length === 0 ? (
                <p className="text-muted-foreground text-sm">Sin datos en este rango.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mesero</TableHead>
                      <TableHead className="text-right">Pedidos</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byWaiter.map((waiter) => (
                      <TableRow key={waiter.full_name}>
                        <TableCell>{waiter.full_name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {waiter.orders_count}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatMoney(waiter.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
