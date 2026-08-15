"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, parseForm, type ActionResult } from "@/lib/action-result";
import { getAdminClient } from "@/lib/supabase/admin";
import { getServerClient } from "@/lib/supabase/server";

import { requireRole } from "./guards";

/**
 * Gestión de cuentas del personal.
 *
 * Este es el ÚNICO módulo que obliga a tener un BFF, y por eso son Server Actions y no
 * RPC de Postgres: crear un usuario exige la Admin API de GoTrue (`auth.admin.*`) con
 * la service_role key, que jamás puede llegar al navegador.
 *
 * Como la service_role ignora RLS, cada acción verifica PRIMERO que quien llama sea
 * admin. No hay red de seguridad debajo: aquí el guard ES la seguridad.
 */

const USERS_PATH = "/admin/usuarios";

// CLAUDE.md habla de "usuarios de meseros", pero en producción alguien tiene que poder
// crear también la cuenta de Caja: sin esto el restaurante no podría arrancar sin tocar
// la base a mano. No se permite crear admins desde la UI a propósito.
const createUserSchema = z.object({
  email: z.email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  full_name: z.string().trim().min(1, "El nombre es obligatorio").max(80, "Máximo 80 caracteres"),
  role: z.enum(["mesero", "caja"], { message: "Rol inválido" }),
});

export async function createStaffUser(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const parsed = parseForm(createUserSchema, formData);
  if (!parsed.ok) return parsed.result;

  const { email, password, full_name, role } = parsed.data;
  const admin = getAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no hay correo saliente en el servidor del restaurante
    user_metadata: { full_name },
  });

  if (error || !data.user) {
    const message = error?.message ?? "";
    return failure(
      message.includes("already been registered") || message.includes("already exists")
        ? "Ya existe una cuenta con ese correo."
        : (message ?? "No se pudo crear el usuario"),
    );
  }

  // El perfil no lo crea un trigger a propósito: así el rol se asigna explícitamente
  // aquí y no queda escondido en la base.
  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: data.user.id, full_name, role });

  if (profileError) {
    // Sin perfil, la cuenta no puede hacer nada (todas las políticas dependen de
    // `profiles`). Se deshace para no dejar usuarios fantasma en auth.users.
    await admin.auth.admin.deleteUser(data.user.id);
    return failure(profileError.message);
  }

  revalidatePath(USERS_PATH);
  return { ok: true } satisfies ActionResult;
}

/**
 * Dar de baja NO borra la cuenta: `is_active = false`. Borrarla dejaría pedidos
 * históricos huérfanos, y de hecho la FK con ON DELETE RESTRICT lo impide.
 *
 * El efecto es inmediato aunque la persona tenga un token vigente de 8 horas, porque el
 * rol se resuelve contra `profiles` en cada consulta (ver docs/architecture.md).
 */
export async function setStaffActive(id: string, active: boolean): Promise<ActionResult> {
  await requireRole(["admin"]);

  // Con el cliente de sesión, no service_role: la política de admin sobre `profiles` ya
  // permite esto, así que la operación queda cubierta también por RLS.
  const supabase = await getServerClient();
  const { error } = await supabase.from("profiles").update({ is_active: active }).eq("id", id);

  if (error) return failure(error.message);

  revalidatePath(USERS_PATH);
  return { ok: true };
}

const passwordSchema = z.object({
  id: z.uuid(),
  password: z.string().min(6, "Mínimo 6 caracteres"),
});

/** El personal olvida contraseñas y no hay correo saliente: el admin las reasigna. */
export async function resetStaffPassword(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const parsed = parseForm(passwordSchema, formData);
  if (!parsed.ok) return parsed.result;

  const { error } = await getAdminClient().auth.admin.updateUserById(parsed.data.id, {
    password: parsed.data.password,
  });

  if (error) return failure(error.message);
  return { ok: true } satisfies ActionResult;
}

const renameSchema = z.object({
  id: z.uuid(),
  full_name: z.string().trim().min(1, "El nombre es obligatorio").max(80, "Máximo 80 caracteres"),
});

export async function renameStaff(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const parsed = parseForm(renameSchema, formData);
  if (!parsed.ok) return parsed.result;

  const supabase = await getServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name })
    .eq("id", parsed.data.id);

  if (error) return failure(error.message);

  revalidatePath(USERS_PATH);
  return { ok: true } satisfies ActionResult;
}
