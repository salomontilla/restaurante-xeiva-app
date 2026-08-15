"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, parseForm, type ActionResult } from "@/lib/action-result";
import { getServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/modules/auth/guards";

/**
 * CRUD de salones y mesas (solo admin).
 *
 * Se usa el cliente de SESIÓN, no service_role: las políticas de admin sobre
 * `dining_rooms` y `tables` ya permiten esto, así que la operación queda cubierta por
 * RLS además del guard. `requireRole` está para dar un error decente y no depender de
 * que la política falle.
 *
 * NADA se borra de verdad: dar de baja es `is_active = false`. Un salón o una mesa
 * borrados romperían los pedidos históricos que los referencian, y de hecho las FK con
 * ON DELETE RESTRICT lo impiden.
 */

const ADMIN_PATH = "/admin/salones";

/** El índice único parcial sobre el nombre solo aplica entre activos. */
function friendlyError(message: string, entity: "salón" | "mesa"): string {
  if (message.includes("duplicate key") || message.includes("_key")) {
    return `Ya existe un ${entity} con ese nombre.`;
  }
  return message;
}

// -----------------------------------------------------------------------------
// Salones
// -----------------------------------------------------------------------------

const roomSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(60, "Máximo 60 caracteres"),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export async function createRoom(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const parsed = parseForm(roomSchema, formData);
  if (!parsed.ok) return parsed.result;

  const supabase = await getServerClient();
  const { error } = await supabase.from("dining_rooms").insert(parsed.data);

  if (error) return failure(friendlyError(error.message, "salón"));

  revalidatePath(ADMIN_PATH);
  return { ok: true } satisfies ActionResult;
}

export async function updateRoom(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "");
  const parsed = parseForm(roomSchema, formData);
  if (!parsed.ok) return parsed.result;

  const supabase = await getServerClient();
  const { error } = await supabase.from("dining_rooms").update(parsed.data).eq("id", id);

  if (error) return failure(friendlyError(error.message, "salón"));

  revalidatePath(ADMIN_PATH);
  return { ok: true } satisfies ActionResult;
}

export async function setRoomActive(id: string, active: boolean): Promise<ActionResult> {
  await requireRole(["admin"]);

  const supabase = await getServerClient();

  // Desactivar un salón sin desactivar sus mesas dejaría mesas visibles en el mapa de
  // Caja apuntando a un salón que ya no existe para el negocio. Se hace en cascada.
  const { error } = await supabase.from("dining_rooms").update({ is_active: active }).eq("id", id);
  if (error) return failure(friendlyError(error.message, "salón"));

  if (!active) {
    const { error: tablesError } = await supabase
      .from("tables")
      .update({ is_active: false })
      .eq("dining_room_id", id);
    if (tablesError) return failure(tablesError.message);
  }

  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Mesas
// -----------------------------------------------------------------------------

const tableSchema = z.object({
  dining_room_id: z.uuid("Salón inválido"),
  label: z.string().trim().min(1, "El nombre es obligatorio").max(20, "Máximo 20 caracteres"),
  seats: z
    .union([z.literal(""), z.coerce.number().int().positive("Debe ser mayor que 0")])
    .transform((v) => (v === "" ? null : v)),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export async function createTable(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const parsed = parseForm(tableSchema, formData);
  if (!parsed.ok) return parsed.result;

  const supabase = await getServerClient();
  const { error } = await supabase.from("tables").insert(parsed.data);

  if (error) return failure(friendlyError(error.message, "mesa"));

  revalidatePath(ADMIN_PATH);
  return { ok: true } satisfies ActionResult;
}

/**
 * Crea varias mesas numeradas de una vez. Montar un salón mesa por mesa es tedioso y
 * es justo lo que un admin hace una sola vez al configurar el local.
 */
const bulkSchema = z.object({
  dining_room_id: z.uuid("Salón inválido"),
  prefix: z.string().trim().max(10, "Máximo 10 caracteres").default(""),
  from: z.coerce.number().int().min(1, "Desde debe ser 1 o más"),
  to: z.coerce.number().int().min(1),
  seats: z
    .union([z.literal(""), z.coerce.number().int().positive()])
    .transform((v) => (v === "" ? null : v)),
});

export async function createTablesBulk(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const parsed = parseForm(bulkSchema, formData);
  if (!parsed.ok) return parsed.result;

  const { dining_room_id, prefix, from, to, seats } = parsed.data;

  if (to < from) {
    return { ok: false, fieldErrors: { to: "Debe ser mayor o igual que 'desde'" } } satisfies ActionResult;
  }
  if (to - from > 99) {
    return { ok: false, fieldErrors: { to: "Máximo 100 mesas por vez" } } satisfies ActionResult;
  }

  const rows = Array.from({ length: to - from + 1 }, (_, i) => ({
    dining_room_id,
    label: `${prefix}${from + i}`,
    seats,
    sort_order: from + i,
  }));

  const supabase = await getServerClient();
  const { error } = await supabase.from("tables").insert(rows);

  if (error) return failure(friendlyError(error.message, "mesa"));

  revalidatePath(ADMIN_PATH);
  return { ok: true } satisfies ActionResult;
}

export async function updateTable(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "");
  const parsed = parseForm(tableSchema, formData);
  if (!parsed.ok) return parsed.result;

  const supabase = await getServerClient();
  const { error } = await supabase.from("tables").update(parsed.data).eq("id", id);

  if (error) return failure(friendlyError(error.message, "mesa"));

  revalidatePath(ADMIN_PATH);
  return { ok: true } satisfies ActionResult;
}

export async function setTableActive(id: string, active: boolean): Promise<ActionResult> {
  await requireRole(["admin"]);

  const supabase = await getServerClient();

  // Una mesa con un pedido abierto no se puede desactivar: desaparecería del mapa de
  // Caja con comida servida sin cobrar.
  if (!active) {
    const { data: openOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("table_id", id)
      .in("status", ["pendiente", "impreso", "en_mesa"])
      .maybeSingle();

    if (openOrder) {
      return failure("Esta mesa tiene un pedido abierto. Ciérralo antes de desactivarla.");
    }
  }

  const { error } = await supabase
    .from("tables")
    .update({ is_active: active, assigned_waiter_id: active ? undefined : null })
    .eq("id", id);

  if (error) return failure(friendlyError(error.message, "mesa"));

  revalidatePath(ADMIN_PATH);
  return { ok: true };
}
