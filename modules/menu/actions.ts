"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { failure, parseForm, type ActionResult } from "@/lib/action-result";
import { getServerClient } from "@/lib/supabase/server";
import { requireRole } from "@/modules/auth/guards";

/**
 * CRUD de la carta (solo admin).
 *
 * Regla central del dominio: la PORCIÓN ESTÁNDAR no es una variante. El plato tiene su
 * `base_price` y las variantes (media porción, porción pequeña) son alternativas
 * opcionales con su propio precio fijo. Por eso los formularios hablan de "precio de la
 * porción normal" en el plato y de "alternativas" en las variantes.
 *
 * Cambiar el precio de un plato NO afecta pedidos ya tomados: `order_items` congela
 * `unit_price` y el nombre en el momento de la venta.
 */

const MENU_PATH = "/admin/menu";

function friendlyError(message: string, entity: string): string {
  if (message.includes("duplicate key") || message.includes("_key")) {
    return `Ya existe ${entity} con ese nombre.`;
  }
  return message;
}

/** Los precios se capturan en pesos enteros: en COP no se usan decimales. */
const priceField = z.coerce
  .number("Escribe un precio válido")
  .int("Sin decimales")
  .min(0, "No puede ser negativo")
  .max(99_999_999, "Precio demasiado alto");

// -----------------------------------------------------------------------------
// Categorías
// -----------------------------------------------------------------------------

const categorySchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(40, "Máximo 40 caracteres"),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export async function createCategory(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const parsed = parseForm(categorySchema, formData);
  if (!parsed.ok) return parsed.result;

  const supabase = await getServerClient();
  const { error } = await supabase.from("menu_categories").insert(parsed.data);
  if (error) return failure(friendlyError(error.message, "una categoría"));

  revalidatePath(MENU_PATH);
  return { ok: true } satisfies ActionResult;
}

export async function updateCategory(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "");
  const parsed = parseForm(categorySchema, formData);
  if (!parsed.ok) return parsed.result;

  const supabase = await getServerClient();
  const { error } = await supabase.from("menu_categories").update(parsed.data).eq("id", id);
  if (error) return failure(friendlyError(error.message, "una categoría"));

  revalidatePath(MENU_PATH);
  return { ok: true } satisfies ActionResult;
}

export async function setCategoryActive(id: string, active: boolean): Promise<ActionResult> {
  await requireRole(["admin"]);

  // Los platos NO se desactivan en cascada: `menu_items.category_id` es opcional, así
  // que quedan sin categoría y siguen vendiéndose. Dar de baja una categoría es
  // reorganizar la carta, no dejar de vender esos platos.
  const supabase = await getServerClient();
  const { error } = await supabase.from("menu_categories").update({ is_active: active }).eq("id", id);
  if (error) return failure(error.message);

  revalidatePath(MENU_PATH);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Platos
// -----------------------------------------------------------------------------

const itemSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(80, "Máximo 80 caracteres"),
  description: z
    .string()
    .trim()
    .max(200, "Máximo 200 caracteres")
    .transform((v) => v || null),
  base_price: priceField,
  category_id: z
    .string()
    .transform((v) => v || null)
    .refine((v) => v === null || z.uuid().safeParse(v).success, "Categoría inválida"),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export async function createMenuItem(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const parsed = parseForm(itemSchema, formData);
  if (!parsed.ok) return parsed.result;

  const supabase = await getServerClient();
  const { error } = await supabase.from("menu_items").insert(parsed.data);
  if (error) return failure(friendlyError(error.message, "un plato"));

  revalidatePath(MENU_PATH);
  return { ok: true } satisfies ActionResult;
}

export async function updateMenuItem(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "");
  const parsed = parseForm(itemSchema, formData);
  if (!parsed.ok) return parsed.result;

  const supabase = await getServerClient();
  const { error } = await supabase.from("menu_items").update(parsed.data).eq("id", id);
  if (error) return failure(friendlyError(error.message, "un plato"));

  revalidatePath(MENU_PATH);
  return { ok: true } satisfies ActionResult;
}

export async function setMenuItemActive(id: string, active: boolean): Promise<ActionResult> {
  await requireRole(["admin"]);

  const supabase = await getServerClient();
  const { error } = await supabase.from("menu_items").update({ is_active: active }).eq("id", id);
  if (error) return failure(error.message);

  revalidatePath(MENU_PATH);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Variantes
// -----------------------------------------------------------------------------

const variantSchema = z.object({
  menu_item_id: z.uuid("Plato inválido"),
  name: z.string().trim().min(1, "El nombre es obligatorio").max(40, "Máximo 40 caracteres"),
  price: priceField,
  sort_order: z.coerce.number().int().min(0).default(0),
});

export async function createVariant(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const parsed = parseForm(variantSchema, formData);
  if (!parsed.ok) return parsed.result;

  const supabase = await getServerClient();
  const { error } = await supabase.from("menu_item_variants").insert(parsed.data);
  if (error) return failure(friendlyError(error.message, "una variante"));

  revalidatePath(MENU_PATH);
  return { ok: true } satisfies ActionResult;
}

export async function updateVariant(_prev: ActionResult | null, formData: FormData) {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "");
  const parsed = parseForm(variantSchema, formData);
  if (!parsed.ok) return parsed.result;

  const supabase = await getServerClient();
  const { error } = await supabase.from("menu_item_variants").update(parsed.data).eq("id", id);
  if (error) return failure(friendlyError(error.message, "una variante"));

  revalidatePath(MENU_PATH);
  return { ok: true } satisfies ActionResult;
}

export async function setVariantActive(id: string, active: boolean): Promise<ActionResult> {
  await requireRole(["admin"]);

  const supabase = await getServerClient();
  const { error } = await supabase
    .from("menu_item_variants")
    .update({ is_active: active })
    .eq("id", id);
  if (error) return failure(error.message);

  revalidatePath(MENU_PATH);
  return { ok: true };
}
