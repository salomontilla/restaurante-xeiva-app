import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/db.types";

/**
 * Cliente de Supabase para SERVER COMPONENTS y SERVER ACTIONS (vista de admin).
 *
 * Usa la anon key + la sesión del usuario en cookies, así que respeta RLS igual
 * que el navegador. Para operaciones que requieren service_role ver `admin.ts`.
 */
export async function getServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Llamado desde un Server Component: las cookies son de solo lectura.
            // El middleware se encarga de refrescar la sesión, así que se ignora.
          }
        },
      },
    },
  );
}
