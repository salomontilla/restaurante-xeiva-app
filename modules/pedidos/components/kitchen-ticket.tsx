import type { Ticket } from "../caja-actions";

/**
 * La comanda que se lleva en papel a Cocina.
 *
 * Se imprime en hoja normal, no en térmica, así que hay espacio de sobra: lo que manda
 * es que se lea rápido en una cocina con prisa y ruido. De ahí la letra grande para la
 * cantidad y el plato, y que las observaciones destaquen.
 *
 * Cuando es una ADICIÓN lo dice enorme arriba: es la diferencia entre preparar dos
 * platos nuevos y volver a preparar toda la mesa.
 */
export function KitchenTicket({ ticket }: { ticket: Ticket }) {
  const printedAt = new Date(ticket.printed_now_at);

  return (
    <article className="mx-auto w-full max-w-lg bg-white p-6 text-black">
      <header className="border-b-2 border-black pb-3">
        {ticket.is_addition ? (
          <p className="mb-2 border-2 border-black px-2 py-1 text-center text-2xl font-black uppercase">
            Adición
          </p>
        ) : null}

        <h1 className="text-4xl font-black">Mesa {ticket.order.table_label}</h1>
        <p className="text-lg">{ticket.dining_room}</p>

        <div className="mt-2 flex justify-between text-sm">
          <span>{ticket.waiter ? `Mesero: ${ticket.waiter}` : "Sin mesero"}</span>
          <span>
            {printedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </header>

      <ul className="divide-y-2 divide-dashed divide-black">
        {ticket.items.map((item) => (
          <li key={item.id} className="flex gap-4 py-3">
            <span className="w-12 shrink-0 text-3xl font-black tabular-nums">{item.qty}</span>
            <span className="flex-1">
              <span className="block text-2xl font-bold leading-tight">{item.item_name}</span>
              {item.variant_name ? (
                <span className="block text-xl">{item.variant_name}</span>
              ) : null}
              {item.note ? (
                <span className="mt-1 block border-l-4 border-black pl-2 text-lg font-semibold uppercase">
                  {item.note}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {ticket.items.length === 0 ? (
        <p className="py-6 text-center text-lg">No hay nada nuevo por preparar.</p>
      ) : null}

      {ticket.order.note ? (
        <p className="mt-4 border-2 border-black p-2 text-lg">{ticket.order.note}</p>
      ) : null}

      <footer className="mt-4 border-t-2 border-black pt-2 text-center text-xs">
        {ticket.restaurant?.name} · {printedAt.toLocaleDateString("es-CO")}
      </footer>
    </article>
  );
}
