import { PrintRecibo } from "@/modules/pagos/components/print-recibo";

export const metadata = { title: "Recibo" };

export default async function PrintReciboPage({
  params,
}: PageProps<"/imprimir/recibo/[checkId]">) {
  const { checkId } = await params;

  return <PrintRecibo checkId={checkId} />;
}
