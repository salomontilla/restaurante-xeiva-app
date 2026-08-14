import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db.types";

/**
 * Cliente con SERVICE_ROLE. Ignora RLS por completo.
 *
 * Único uso legítimo en este proyecto: la Admin API de Auth para crear/desactivar
 * cuentas de meseros (`modules/auth/actions.ts`), porque `auth.admin.createUser`
 * no se puede hacer con la anon key.
 *
 * El `import "server-only"` de arriba hace que el build FALLE si algún día este
 * módulo termina importado desde un componente cliente. No quitarlo.
 *
 * Toda función que use este cliente debe verificar PRIMERO que el llamante sea
 * admin (ver `modules/auth/guards.ts`), porque aquí no hay RLS que lo detenga.
 */
export function getAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno");

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
