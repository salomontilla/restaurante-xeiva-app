import { OrderDetail } from "@/modules/pedidos/components/order-detail";

export const metadata = { title: "Mesa · Caja" };

export default async function CajaMesaPage({ params }: PageProps<"/caja/mesa/[tableId]">) {
  const { tableId } = await params;

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <OrderDetail tableId={tableId} />
    </div>
  );
}
