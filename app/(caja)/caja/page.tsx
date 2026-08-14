export const metadata = { title: "Mesas · Caja" };

export default function CajaPage() {
  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <h1 className="text-xl font-semibold">Mapa de mesas</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Aquí va el mapa en vivo desde la vista <code>v_table_map</code>, suscrito por
        Realtime a <code>orders</code> y <code>tables</code>. Se implementa en la Fase 5.
      </p>
    </div>
  );
}
