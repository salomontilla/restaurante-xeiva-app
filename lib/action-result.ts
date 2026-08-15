import type { z } from "zod";

/**
 * Resultado de una Server Action, pensado para `useActionState`.
 *
 * Los errores de validación vienen por campo (`fieldErrors`) para poder pintarlos
 * junto a cada input; `error` es el mensaje general (fallo de base de datos, permisos,
 * un correo repetido). Una acción puede devolver ambos.
 */
export type ActionResult =
  | { ok: true; error?: never; fieldErrors?: never }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

/** Estado inicial de un formulario: ni éxito ni error todavía. */
export const IDLE: ActionResult | null = null;

export function failure(error: string): ActionResult {
  return { ok: false, error };
}

/**
 * Valida un FormData con un esquema de zod y devuelve los errores en el formato que
 * espera el formulario. Evita repetir el mismo `safeParse` + mapeo en cada acción.
 */
export function parseForm<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): { ok: true; data: z.infer<T> } | { ok: false; result: ActionResult } {
  const parsed = schema.safeParse(Object.fromEntries(formData));

  if (parsed.success) return { ok: true, data: parsed.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "_");
    fieldErrors[key] ??= issue.message;
  }

  return { ok: false, result: { ok: false, fieldErrors } };
}
