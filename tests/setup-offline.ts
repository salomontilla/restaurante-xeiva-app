// IndexedDB en Node, para poder probar Dexie de verdad en vez de simularlo.
import "fake-indexeddb/auto";

// El motor de sincronización escucha eventos del navegador. En Node no existen, así que
// se stubean con lo mínimo para que el módulo cargue.
Object.defineProperty(globalThis, "window", {
  value: {
    addEventListener: () => {},
    removeEventListener: () => {},
  },
  writable: true,
});

Object.defineProperty(globalThis, "document", {
  value: {
    addEventListener: () => {},
    removeEventListener: () => {},
    visibilityState: "visible",
  },
  writable: true,
});
