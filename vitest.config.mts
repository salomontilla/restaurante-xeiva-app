import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Pruebas unitarias de la capa offline.
 *
 * `fake-indexeddb/auto` mete una implementación de IndexedDB en Node, así que la lógica
 * de borradores, outbox y sincronización se puede ejercitar de verdad —con Dexie real,
 * no con mocks— sin necesidad de un navegador.
 */
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-offline.ts"],
    include: ["modules/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
