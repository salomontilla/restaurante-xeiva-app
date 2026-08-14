"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient } from "@/lib/supabase/server";

import { requireRole } from "./guards";

/**
 * Gestión de cuentas de meseros.
 *
 * Este es el ÚNICO módulo que obliga a tener un BFF, y por eso son Server Actions y no
 * RPC de Postgres: crear un usuario exige la Admin API de GoTrue (`auth.admin.*`) con
 * la service_role key, que jamás puede llegar al navegador.
 *
 * Como la service_role ignora RLS, cada acción verifica PRIMERO que quien llama sea
 * admin. No hay red de seguridad debajo: aquí el guard ES la seguridad.
 */

const createWaiterSchema = z.object({
  email: z.email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  fullName: z.string().trim().min(1, "El nombre es obligatorio"),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createWaiter(input: unknown): Promise<ActionResult> {
  await requireRole(["admin"]);

  const parsed = createWaiterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { email, password, fullName } = parsed.data;

  const admin = getAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no hay correo saliente en el servidor del restaurante
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "No se pudo crear el usuario" };
  }

  // El perfil no lo crea un trigger a propósito: así el rol se asigna explícitamente
  // aquí y no queda escondido en la base.
  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: data.user.id, full_name: fullName, role: "mesero" });

  if (profileError) {
    // Sin perfil, el usuario no puede hacer nada (todas las políticas dependen de
    // `profiles`). Se deshace para no dejar cuentas fantasma en auth.users.
    await admin.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: profileError.message };
  }

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

/**
 * Dar de baja NO borra el usuario: `is_active = false`. Borrarlo dejaría pedidos
 * históricos huérfanos, y de hecho la FK con ON DELETE RESTRICT lo impide.
 *
 * El efecto es inmediato aunque la persona tenga un token vigente de horas, porque el
 * rol se resuelve contra `profiles` en cada consulta.
 */
export async function setWaiterActive(userId: string, active: boolean): Promise<ActionResult> {
  await requireRole(["admin"]);

  // Con el cliente de sesión (no service_role): la política de admin sobre `profiles`
  // ya permite esto, y así la operación queda cubierta por RLS.
  const supabase = await getServerClient();
  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/usuarios");
  return { ok: true };
}

export async function resetWaiterPassword(
  userId: string,
  newPassword: string,
): Promise<ActionResult> {
  await requireRole(["admin"]);

  if (newPassword.length < 6) {
    return { ok: false, error: "Mínimo 6 caracteres" };
  }

  const { error } = await getAdminClient().auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
