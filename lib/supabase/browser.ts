import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/db.types";

/**
 * Cliente de Supabase para el NAVEGADOR. Lo usan las vistas de mesero y de caja,
 * que hablan directo con Postgres (RLS es la frontera de seguridad).
 *
 * Es un singleton a propósito: el mesero mantiene una sola sesión con refresco
 * automático del token, y Caja mantiene un solo WebSocket de Realtime.
 */
let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function getBrowserClient() {
  if (client) return client;

  client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // El mesero puede quedarse sin señal durante un turno completo. La sesión
        // vive en localStorage y NO se destruye por un refresco fallido de red.
        detectSessionInUrl: false,
      },
      realtime: {
        // El WiFi rural se cae seguido; reconectar rápido importa más que ahorrar tráfico.
        params: { eventsPerSecond: 10 },
      },
    },
  );

  return client;
}
