import { Checkout } from "@/modules/pagos/components/checkout";

export const metadata = { title: "Cobrar · Caja" };

export default async function CerrarMesaPage({
  params,
}: PageProps<"/caja/mesa/[tableId]/cerrar">) {
  const { tableId } = await params;

  return (
    <div className="mx-auto w-full max-w-3xl p-4">
      <Checkout tableId={tableId} />
    </div>
  );
}
