import { redirect } from "next/navigation";

import { getSessionProfile } from "@/modules/auth/guards";
import { HOME_BY_ROLE } from "@/modules/auth/types";

/**
 * La raíz no muestra nada: cada rol tiene su propia pantalla de inicio. Es también
 * el destino al que vuelve el login, para no duplicar en el cliente la decisión de
 * a dónde va cada rol.
 */
export default async function RootPage() {
  const profile = await getSessionProfile();
  redirect(profile ? HOME_BY_ROLE[profile.role] : "/login");
}
