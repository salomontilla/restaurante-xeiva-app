import { formatMoney } from "@/lib/money";

import type { Receipt as ReceiptData } from "../actions";

const METHOD_LABEL = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
} as const;

/**
 * Recibo del cliente.
 *
 * No es una factura electrónica ni pretende serlo: es el papel que se entrega bajo
 * demanda. Sin impuestos, propina ni descuentos, así que el total es literalmente la
 * suma de las líneas y no hay subtotales que explicar.
 *
 * Cuando la mesa se dividió, lo dice arriba ("Cuenta 2 de 3") para que el cliente
 * entienda que no está viendo el total de la mesa.
 */
export function Receipt({ receipt }: { receipt: ReceiptData }) {
  const paidAt = receipt.check.paid_at ? new Date(receipt.check.paid_at) : new Date();
  const isSplit = receipt.checks_total > 1;

  return (
    <article className="mx-auto w-full max-w-sm bg-white p-6 text-black">
      <header className="text-center">
        <h1 className="text-xl font-bold">{receipt.restaurant?.name}</h1>
        {receipt.restaurant?.address ? (
          <p className="text-sm">{receipt.restaurant.address}</p>
        ) : null}
        {receipt.restaurant?.phone ? <p className="text-sm">{receipt.restaurant.phone}</p> : null}
      </header>

      <div className="my-3 border-y border-dashed border-black py-2 text-sm">
        <div className="flex justify-between">
          <span>Mesa {receipt.order.table_label}</span>
          <span>{receipt.dining_room}</span>
        </div>
        <div className="flex justify-between">
          <span>{paidAt.toLocaleDateString("es-CO")}</span>
          <span>
            {paidAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        {receipt.waiter ? <p>Atendió: {receipt.waiter}</p> : null}
        {isSplit ? (
          <p className="mt-1 font-bold">
            Cuenta {receipt.check.seq} de {receipt.checks_total}
          </p>
        ) : null}
      </div>

      <table className="w-full text-sm">
        <tbody>
          {receipt.items.map((item, index) => (
            <tr key={index} className="align-top">
              <td className="w-6 tabular-nums">{item.qty}</td>
              <td>
                {item.item_name}
                {item.variant_name ? <span className="block text-xs">{item.variant_name}</span> : null}
              </td>
              <td className="text-right tabular-nums">{formatMoney(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-between border-t-2 border-black pt-2 text-lg font-bold">
        <span>Total</span>
        <span className="tabular-nums">{formatMoney(receipt.check.total)}</span>
      </div>

      <div className="mt-3 flex flex-col gap-1 text-sm">
        {receipt.payments.map((payment, index) => (
          <div key={index}>
            <div className="flex justify-between">
              <span>{METHOD_LABEL[payment.method]}</span>
              <span className="tabular-nums">{formatMoney(payment.amount)}</span>
            </div>
            {payment.tendered ? (
              <>
                <div className="flex justify-between text-xs">
                  <span>Recibido</span>
                  <span className="tabular-nums">{formatMoney(payment.tendered)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Vuelto</span>
                  <span className="tabular-nums">{formatMoney(payment.change)}</span>
                </div>
              </>
            ) : null}
            {payment.reference ? (
              <p className="text-xs">Ref: {payment.reference}</p>
            ) : null}
          </div>
        ))}
      </div>

      {receipt.restaurant?.receipt_footer ? (
        <p className="mt-4 border-t border-dashed border-black pt-2 text-center text-sm">
          {receipt.restaurant.receipt_footer}
        </p>
      ) : null}
    </article>
  );
}
