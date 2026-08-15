/// <reference lib="webworker" />

/**
 * Service worker de la PWA del mesero.
 *
 * Su único trabajo es que la app CARGUE sin señal. Los datos no viven aquí: viven en
 * IndexedDB (`modules/offline/db.ts`). Este archivo solo cachea el caparazón.
 *
 * Está escrito a mano en vez de usar Serwist porque Serwist 9 inyecta configuración de
 * webpack y Next 16 compila con Turbopack. Next documenta este camino —registrar un
 * worker propio con `new URL(..., import.meta.url)`— y de paso nos deja control exacto
 * sobre lo único que de verdad importa: qué NO se cachea.
 */

declare const self: ServiceWorkerGlobalScope;

const VERSION = "v1";
const SHELL_CACHE = `xeiva-shell-${VERSION}`;
const ASSET_CACHE = `xeiva-assets-${VERSION}`;

/** Rutas del backend que jamás se cachean. Ver el comentario en `shouldBypass`. */
const NEVER_CACHE = ["/auth/v1", "/rest/v1", "/realtime/v1", "/storage/v1"];

function shouldBypass(url: URL): boolean {
  /*
   * Nada de Supabase pasa por caché.
   *
   * Servir una respuesta vieja de `/auth/v1` haría que el mesero pareciera con sesión
   * cuando ya no la tiene (o al revés), y una de `/rest/v1` le mostraría mesas libres
   * que ya están ocupadas. La app tolera perfectamente NO tener respuesta —para eso
   * está IndexedDB— pero no tolera una respuesta equivocada.
   */
  if (url.origin !== self.location.origin) return true;
  return NEVER_CACHE.some((path) => url.pathname.startsWith(path));
}

self.addEventListener("install", (event) => {
  // Toma el control sin esperar a que se cierren las pestañas viejas: en un celular
  // solo hay una, y esperar solo retrasa la actualización.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Limpieza de versiones anteriores del caché.
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("xeiva-") && !name.endsWith(VERSION))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (shouldBypass(url)) return;

  // Navegaciones: red primero, caché de respaldo. Así el mesero siempre ve la versión
  // nueva cuando hay señal, y la última que funcionó cuando no la hay.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // Assets del build: llevan hash en el nombre, así que son inmutables. Caché primero,
  // que además ahorra batería y datos en un celular con WiFi malo.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }
});

async function networkFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Sin red y sin copia: se responde algo legible en vez de el error del navegador.
    return new Response(
      "<!doctype html><meta charset='utf-8'><title>Sin conexión</title>" +
        "<body style='font-family:system-ui;padding:2rem'>" +
        "<h1>Sin conexión</h1><p>Abre la app de nuevo cuando vuelva la señal.</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);

  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/**
 * Borrado de cachés al cerrar sesión.
 *
 * El mismo celular pasa de un mesero a otro entre turnos y el caparazón cacheado lleva
 * dentro el id del mesero anterior.
 */
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | null)?.type === "XEIVA_CLEAR_CACHES") {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(
          names.filter((name) => name.startsWith("xeiva-")).map((name) => caches.delete(name)),
        );
      })(),
    );
  }
});

export {};
