import "server-only";

import { getServerClient } from "@/lib/supabase/server";

import type { Profile } from "./types";

/**
 * Todo el personal, para la pantalla de administración de usuarios.
 * Incluye a los dados de baja: el admin necesita verlos para reactivarlos.
 */
export async function listStaff(): Promise<Profile[]> {
  const supabase = await getServerClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .order("is_active", { ascending: false })
    .order("role")
    .order("full_name");

  if (error) throw new Error(`No se pudo cargar el personal: ${error.message}`);
  return data ?? [];
}
