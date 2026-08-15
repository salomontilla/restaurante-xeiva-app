/**
 * Estado de conexión.
 *
 * `navigator.onLine` MIENTE, y miente justo en el caso de este restaurante: con el WiFi
 * conectado pero sin ruta al servidor (el viento mueve la antena) el navegador sigue
 * diciendo que hay conexión. Por eso la fuente de verdad es el RESULTADO DE LAS LLAMADAS
 * REALES: si una llamada falla por red, estamos offline; si una responde, estamos online.
 *
 * `navigator.onLine` se usa solo como pista para intentar antes de tiempo cuando el
 * sistema operativo avisa que volvió el WiFi.
 */

export type ConnectionStatus = "online" | "offline";

type Listener = (status: ConnectionStatus) => void;

let status: ConnectionStatus = "online";
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(status);
}

export function getConnectionStatus(): ConnectionStatus {
  return status;
}

export function subscribeConnection(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Una llamada respondió: hay ruta al servidor, pase lo que pase con `navigator.onLine`. */
export function reportReachable() {
  if (status !== "online") {
    status = "online";
    emit();
  }
}

/** Una llamada falló por red. No cuenta un error de negocio ni un 4xx. */
export function reportUnreachable() {
  if (status !== "offline") {
    status = "offline";
    emit();
  }
}

/**
 * ¿Este error es de red o del servidor?
 *
 * Importa mucho: un error de RED se reintenta solo, un error de NEGOCIO hay que
 * mostrárselo a la persona y dejar de reintentar. Confundirlos hace que el mesero
 * reintente para siempre un pedido que el servidor ya rechazó.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch no pudo salir
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("Load failed") ||
    message.includes("network")
  );
}
