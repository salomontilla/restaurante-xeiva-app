import { requireRole } from "@/modules/auth/guards";
import { MeseroApp } from "@/modules/pedidos/components/mesero-app";

export const metadata = { title: "Mis mesas · Xeiva" };

/**
 * Única ruta de la vista de mesero.
 *
 * El guard corre aquí, en el servidor, UNA sola vez al entrar. De aquí para adentro todo
 * es cliente y sale de IndexedDB, para que perder la señal a mitad de un pedido no
 * rompa nada. Ver `mesero-app.tsx`.
 */
export default async function MeseroPage() {
  const profile = await requireRole(["mesero", "caja", "admin"]);

  return <MeseroApp waiterId={profile.id} />;
}
