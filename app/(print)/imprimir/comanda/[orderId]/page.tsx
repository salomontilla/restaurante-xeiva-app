import { PrintComanda } from "@/modules/pedidos/components/print-comanda";

export const metadata = { title: "Comanda" };

/**
 * `?todo=1` reimprime el pedido completo. Sin ese parámetro sale SOLO lo que aún no ha
 * ido a Cocina, que es el comportamiento correcto por defecto: si la mesa pidió dos
 * cervezas después de la comanda, el segundo papel debe traer las cervezas y nada más,
 * o se cocina dos veces lo mismo.
 */
export default async function PrintComandaPage({
  params,
  searchParams,
}: PageProps<"/imprimir/comanda/[orderId]">) {
  const { orderId } = await params;
  const { todo } = await searchParams;

  return <PrintComanda orderId={orderId} onlyUnprinted={todo === undefined} />;
}
