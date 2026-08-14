import { requireRole } from "@/modules/auth/guards";

export const metadata = { title: "Mis mesas · Xeiva" };

export default async function MeseroPage() {
  const profile = await requireRole(["mesero", "caja", "admin"]);

  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <h1 className="text-xl font-semibold">Hola, {profile.full_name}</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Aquí van las mesas por salón (libre · mía · ocupada por otro) y la toma de pedido
        offline. Se implementa en la Fase 4, sobre la capa de <code>modules/offline</code>.
      </p>
    </div>
  );
}
