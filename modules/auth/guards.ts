import "server-only";

import { redirect } from "next/navigation";

import { getServerClient } from "@/lib/supabase/server";

import { HOME_BY_ROLE, type Profile, type UserRole } from "./types";

/**
 * Perfil del usuario de la sesión actual, o null si no hay sesión válida.
 *
 * Usa `getUser()` y NO `getSession()`: getSession lee la cookie sin validarla,
 * así que un token manipulado pasaría. getUser lo verifica contra el servidor de Auth.
 *
 * Un usuario desactivado (`is_active = false`) cuenta como sin sesión. Esto funciona
 * de inmediato justamente porque el rol vive en `profiles` y no en un claim del JWT:
 * el admin desactiva a alguien y el efecto es instantáneo, sin esperar a que el token
 * se refresque (ver docs/architecture.md → Seguridad).
 */
export async function getSessionProfile(): Promise<Profile | null> {
  const supabase = await getServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!data || !data.is_active) return null;
  return data as Profile;
}

/**
 * Guard para los layouts de cada route group. Sin sesión manda a /login; con un rol
 * que no corresponde, manda a la pantalla de ESE rol en vez de mostrar un 403 — es
 * más útil para el personal que un error.
 */
export async function requireRole(roles: UserRole[]): Promise<Profile> {
  const profile = await getSessionProfile();

  if (!profile) redirect("/login");
  if (!roles.includes(profile.role)) redirect(HOME_BY_ROLE[profile.role]);

  return profile;
}
