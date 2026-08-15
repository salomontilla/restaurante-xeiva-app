import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        /*
         * Alcance del service worker.
         *
         * Turbopack compila `lib/service-worker.ts` a un chunk dentro de
         * `/_next/static/chunks/`, y por defecto un worker solo puede controlar páginas
         * que cuelguen de SU propia ruta. Sin esta cabecera, registrarlo con
         * `scope: "/"` falla con SecurityError y la app deja de abrir sin señal.
         *
         * La cabecera solo la lee el navegador durante el registro del worker; no
         * cambia nada más de cómo se sirven los assets.
         */
        source: "/_next/static/chunks/:path*",
        headers: [{ key: "Service-Worker-Allowed", value: "/" }],
      },
    ];
  },
};

export default nextConfig;
