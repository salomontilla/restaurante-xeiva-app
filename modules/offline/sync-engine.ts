import { getBrowserClient } from "@/lib/supabase/browser";

import { isNetworkError, reportReachable, reportUnreachable } from "./connection";
import { db, type OutboxOp } from "./db";
import { markOpConflict, markOpDone, markOpRetry, nextPendingOp } from "./outbox";

/**
 * Motor de sincronización.
 *
 * Vacía el outbox en orden FIFO ESTRICTO, una operación a la vez. Serial y no en
 * paralelo a propósito: las operaciones sobre una misma mesa tienen orden causal (abrir
 * el pedido, luego la adición), y mandarlas a la vez podría hacer que la adición llegue
 * antes que la apertura.
 *
 * Se dispara por cuatro caminos:
 *   1. Al encolar algo.
 *   2. Evento `online` del navegador (solo una PISTA: `navigator.onLine` miente).
 *   3. `visibilitychange` → visible: el mesero desbloqueó el celular.
 *   4. Backoff exponencial con jitter mientras queden pendientes.
 *
 * La Background Sync API queda fuera a propósito: NO existe en iOS/Safari, así que no se
 * puede depender de ella. Los cuatro caminos de arriba son el camino garantizado.
 */

const MIN_DELAY = 2_000;
const MAX_DELAY = 30_000;

let started = false;
let inFlight: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let delay = MIN_DELAY;

/** Jitter: si varios celulares recuperan señal a la vez, no golpean el servidor juntos. */
function nextDelay(): number {
  delay = Math.min(delay * 2, MAX_DELAY);
  return delay * (0.7 + Math.random() * 0.6);
}

function scheduleRetry() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, nextDelay());
}

function cancelRetry() {
  if (timer) clearTimeout(timer);
  timer = null;
  delay = MIN_DELAY;
}

type RpcResult = { ok: boolean; code: string | null; current_order_id?: string };

/**
 * Envía una operación. Devuelve si conviene seguir con la siguiente.
 *
 * La distinción clave: un error de RED deja la operación pendiente y activa el backoff;
 * un error de NEGOCIO la marca en conflicto y NO se reintenta, porque reintentar no va a
 * cambiar la respuesta y el mesero tiene que enterarse.
 */
async function sendOp(op: OutboxOp): Promise<"continue" | "stop"> {
  const supabase = getBrowserClient();

  try {
    const { data, error } = await supabase.rpc("submit_order", { p_order: op.payload });

    if (error) {
      if (isNetworkError(error)) {
        reportUnreachable();
        await markOpRetry(op, error.message);
        return "stop";
      }
      // Error del servidor (permisos, payload inválido): reintentar no ayuda.
      reportReachable();
      await markOpConflict(op, "SERVER_ERROR", error.message);
      return "continue";
    }

    reportReachable();

    const result = data as RpcResult | null;

    if (result && result.ok === false) {
      await markOpConflict(op, result.code ?? "UNKNOWN", result.code ?? "Rechazado");
      // Si la mesa ya tenía otro pedido abierto, se guarda cuál para poder ofrecer
      // fusionar sin volver a preguntarle al servidor.
      if (result.current_order_id) {
        await db.outbox.update(op.opId, { lastError: result.current_order_id });
      }
      return "continue";
    }

    await markOpDone(op);
    return "continue";
  } catch (error) {
    if (isNetworkError(error)) {
      reportUnreachable();
      await markOpRetry(op, "Sin conexión");
      return "stop";
    }
    await markOpConflict(op, "UNKNOWN", error instanceof Error ? error.message : String(error));
    return "continue";
  }
}

async function drainQueue(): Promise<void> {
  for (;;) {
    const op = await nextPendingOp();
    if (!op) {
      cancelRetry();
      return;
    }

    const outcome = await sendOp(op);
    if (outcome === "stop") {
      scheduleRetry();
      return;
    }
  }
}

/**
 * Vacía la cola.
 *
 * Si ya hay un vaciado en curso devuelve ESA promesa en vez de retornar de inmediato.
 * La diferencia importa: quien llama a `await flush()` espera que al resolverse la cola
 * ya se haya intentado, y con un `return` temprano se quedaba esperando a nada.
 */
export function flush(): Promise<void> {
  if (inFlight) return inFlight;

  inFlight = drainQueue().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Pide un envío cuanto antes (tras encolar, o cuando el mesero toca "reintentar"). */
export function requestFlush(): void {
  cancelRetry();
  void flush();
}

export function startSyncEngine(): () => void {
  if (started) return () => {};
  started = true;

  const onOnline = () => requestFlush();
  const onVisible = () => {
    if (document.visibilityState === "visible") requestFlush();
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  void flush();

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    cancelRetry();
    started = false;
  };
}
