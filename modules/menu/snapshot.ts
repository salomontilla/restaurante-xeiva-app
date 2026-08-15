import { getBrowserClient } from "@/lib/supabase/browser";
import { isNetworkError, reportReachable, reportUnreachable } from "@/modules/offline/connection";
import { db, type CachedMenu } from "@/modules/offline/db";

/**
 * Carta cacheada en el celular.
 *
 * Se trae con el RPC `get_menu_snapshot()`, que devuelve todo el árbol (categorías,
 * platos y variantes) en UNA sola llamada junto con una `version`. Existe exactamente
 * para esto: evitar N+1 y poder decidir si hace falta re-descargar comparando versiones,
 * en vez de traer la carta entera cada vez que el mesero abre la app.
 */

type Snapshot = Omit<CachedMenu, "key" | "cachedAt">;

export async function getCachedMenu(): Promise<CachedMenu | undefined> {
  return db.menu.get("current");
}

/**
 * Refresca la carta si cambió. Devuelve la que quede vigente (la nueva, o la cacheada
 * si no hubo señal).
 */
export async function refreshMenuCache(): Promise<CachedMenu | undefined> {
  const cached = await db.menu.get("current");

  try {
    const { data, error } = await getBrowserClient().rpc("get_menu_snapshot");

    if (error) {
      if (isNetworkError(error)) reportUnreachable();
      return cached;
    }

    reportReachable();

    const snapshot = data as unknown as Snapshot | null;
    if (!snapshot) return cached;

    // Si la versión no cambió, no se toca IndexedDB: escribir de gratis invalidaría los
    // `useLiveQuery` y haría re-renderizar toda la carta sin motivo.
    if (cached && cached.version === snapshot.version) return cached;

    const fresh: CachedMenu = {
      key: "current",
      version: snapshot.version,
      categories: snapshot.categories ?? [],
      items: snapshot.items ?? [],
      cachedAt: new Date().toISOString(),
    };

    await db.menu.put(fresh);
    return fresh;
  } catch (error) {
    if (isNetworkError(error)) reportUnreachable();
    return cached;
  }
}
