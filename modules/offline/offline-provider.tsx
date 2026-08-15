"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { refreshMenuCache } from "@/modules/menu/snapshot";
import { refreshTablesCache } from "@/modules/salones-mesas/tables-cache";

import {
  getConnectionStatus,
  subscribeConnection,
  type ConnectionStatus,
} from "./connection";
import { db } from "./db";
import { requestFlush, startSyncEngine } from "./sync-engine";

type OfflineContextValue = {
  status: ConnectionStatus;
  /** Envíos que el servidor todavía no confirmó. */
  pendingCount: number;
  /** Envíos rechazados por el servidor que necesitan que alguien decida. */
  conflictCount: number;
  /** Vuelve a traer carta y mesas, y empuja el outbox. */
  refresh: () => Promise<void>;
  refreshing: boolean;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function useOffline(): OfflineContextValue {
  const value = useContext(OfflineContext);
  if (!value) throw new Error("useOffline debe usarse dentro de <OfflineProvider>");
  return value;
}

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [refreshing, setRefreshing] = useState(false);

  const status = useSyncExternalStore(
    subscribeConnection,
    getConnectionStatus,
    () => "online" as const, // en el servidor no hay conexión que medir
  );

  const pendingCount = useLiveQuery(() => db.outbox.where("status").equals("pending").count(), [], 0);
  const conflictCount = useLiveQuery(
    () => db.outbox.where("status").equals("conflict").count(),
    [],
    0,
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // En paralelo: son independientes y el mesero está esperando.
      await Promise.all([refreshMenuCache(), refreshTablesCache()]);
      requestFlush();
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const stop = startSyncEngine();

    // El refresco inicial se aplaza un tick a propósito: primero se pinta lo que ya está
    // en IndexedDB —que es lo que el mesero necesita ver— y solo después se sale a la
    // red. Además evita el cascade de renders de llamar a setState durante el efecto.
    const initial = setTimeout(() => void refresh(), 0);

    // El navegador dice que volvió el WiFi. Es solo una pista —puede no haber ruta al
    // servidor— pero es el mejor momento para intentar.
    const onOnline = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(initial);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      stop();
    };
  }, [refresh]);

  return (
    <OfflineContext.Provider
      value={{ status, pendingCount, conflictCount, refresh, refreshing }}
    >
      {children}
    </OfflineContext.Provider>
  );
}
