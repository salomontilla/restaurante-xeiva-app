import type { MetadataRoute } from "next";

/**
 * Manifiesto de la PWA.
 *
 * `start_url` apunta a /mesero y no a /: es la pantalla que se instala en el celular.
 * Un usuario de caja o admin que abra la app instalada será redirigido a lo suyo por el
 * guard, así que no hace falta un manifiesto por rol.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Xeiva · Pedidos",
    short_name: "Xeiva",
    description: "Toma de pedidos del restaurante, funciona sin señal",
    start_url: "/mesero",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#171717",
    theme_color: "#ffffff",
    lang: "es",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android recorta el ícono en círculo; el glifo se dibujó con margen para eso.
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
