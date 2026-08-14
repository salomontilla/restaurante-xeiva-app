import type { Database } from "@/lib/db.types";

/**
 * Tipos del dominio de autenticación, DERIVADOS del esquema real.
 *
 * No se escriben a mano: si mañana el enum `user_role` gana un valor o `profiles`
 * cambia, `pnpm gen:types` lo propaga y el compilador señala lo que hay que ajustar
 * (empezando por los mapas de abajo, que son `Record<UserRole, …>`).
 */
export type UserRole = Database["public"]["Enums"]["user_role"];

/** Solo las columnas de `profiles` que la app necesita en la sesión. */
export type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "full_name" | "role" | "is_active"
>;

/** Dónde aterriza cada rol al entrar. `/` solo redirige según esto. */
export const HOME_BY_ROLE: Record<UserRole, string> = {
  mesero: "/mesero",
  caja: "/caja",
  admin: "/admin",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  mesero: "Mesero",
  caja: "Caja",
  admin: "Administrador",
};
