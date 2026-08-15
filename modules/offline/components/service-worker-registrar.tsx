"use client";

import { useEffect } from "react";

/**
 * Registra el service worker que hace que la app cargue sin señal.
 *
 * `new URL(..., import.meta.url)` es la forma que documenta Next 16: así Turbopack
 * compila el worker como un bundle aparte y le pone su propio hash.
 *
 * Solo se monta dentro de la vista de mesero: Caja y Admin están en una estación fija
 * con red cableada y no ganan nada con un service worker (y sí perderían claridad al
 * depurar).
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Los service workers solo corren en contexto seguro: localhost o HTTPS. En la LAN
    // del restaurante eso significa un hostname real detrás de Caddy, no una IP.
    navigator.serviceWorker
      .register(new URL("../../../lib/service-worker.ts", import.meta.url), {
        scope: "/",
        updateViaCache: "none",
      })
      .catch(() => {
        // Sin service worker la app sigue funcionando con señal; solo se pierde la
        // carga sin conexión. No vale romperle la pantalla al mesero por esto.
      });
  }, []);

  return null;
}

/** Le pide al service worker que borre sus cachés. Se usa al cerrar sesión. */
export async function clearServiceWorkerCaches(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  registration?.active?.postMessage({ type: "XEIVA_CLEAR_CACHES" });
}
