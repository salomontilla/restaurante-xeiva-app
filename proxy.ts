import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresco de sesión en cada navegación.
 *
 * En Next 16 este archivo se llama `proxy.ts` (antes `middleware.ts`) y el runtime
 * busca el export `proxy`.
 *
 * Lo único que hace es rotar las cookies de Supabase cuando el access token está por
 * vencer. Sin esto, los Server Components verían una sesión expirada y mandarían al
 * login a alguien que sí estaba adentro.
 *
 * NO se ponen guards de rol aquí a propósito: los guards viven en los layouts
 * (`modules/auth/guards.ts`), donde ya hay acceso a la base y a `redirect()`. Duplicar
 * la lógica de permisos en dos lugares es la forma más fácil de que se desincronicen.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Esta llamada es la que dispara el refresco. No se usa el resultado.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Todo menos estáticos e imágenes. Se excluye `sw.js` explícitamente: el service
     * worker se sirve desde la raíz y no debe pasar por aquí.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
