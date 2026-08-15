import { TableMap } from "@/modules/salones-mesas/components/table-map";

export const metadata = { title: "Mesas · Caja" };

/**
 * Pantalla principal de Caja.
 *
 * El mapa vive en cliente porque Realtime exige un WebSocket desde el navegador: no hay
 * forma de mantenerlo abierto desde un Server Component.
 */
export default function CajaPage() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <TableMap />
    </div>
  );
}
