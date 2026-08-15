"use client";

import { ChevronLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ConflictsScreen } from "@/modules/offline/components/conflicts-screen";
import { MeseroLogout } from "@/modules/offline/components/mesero-logout";
import { ServiceWorkerRegistrar } from "@/modules/offline/components/service-worker-registrar";
import { SyncBadge } from "@/modules/offline/components/sync-badge";
import type { CachedTable } from "@/modules/offline/db";
import { OfflineProvider } from "@/modules/offline/offline-provider";
import { MenuPicker } from "@/modules/menu/components/menu-picker";

import { openDraft } from "../drafts";
import { OrderScreen } from "./order-screen";
import { TablesScreen } from "./tables-screen";

type View =
  | { screen: "tables" }
  | { screen: "order"; tableId: string; tableLabel: string }
  | { screen: "menu"; tableId: string; tableLabel: string; orderId: string }
  | { screen: "conflicts" };

/**
 * La app del mesero.
 *
 * DECISIÓN IMPORTANTE: la navegación interna NO usa el router de Next. Es una sola ruta
 * (`/mesero`) con estado de vista en el cliente, y el botón "atrás" del celular funciona
 * porque se empuja el historial con `history.pushState` a mano.
 *
 * ¿Por qué? Porque navegar con el router de Next pide al servidor la carga RSC de la
 * ruta nueva, y el mesero pierde señal a mitad de un pedido. Con este esquema, una vez
 * cargada la app, moverse entre mesas, carta y pedido no toca la red para nada.
 *
 * El guard de rol sigue estando en el servidor, pero corre UNA sola vez: al entrar.
 */
export function MeseroApp({ waiterId }: { waiterId: string }) {
  return (
    <OfflineProvider>
      <ServiceWorkerRegistrar />
      <MeseroShell waiterId={waiterId} />
    </OfflineProvider>
  );
}

function MeseroShell({ waiterId }: { waiterId: string }) {
  const [view, setView] = useState<View>({ screen: "tables" });

  useEffect(() => {
    // Se marca la entrada actual del historial para que el primer "atrás" vuelva a las
    // mesas en vez de salirse de la aplicación.
    window.history.replaceState({ xeivaView: { screen: "tables" } }, "");

    const onPopState = (event: PopStateEvent) => {
      const next = (event.state as { xeivaView?: View } | null)?.xeivaView;
      setView(next ?? { screen: "tables" });
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((next: View) => {
    window.history.pushState({ xeivaView: next }, "");
    setView(next);
  }, []);

  const goBack = useCallback(() => window.history.back(), []);

  const onOpenTable = useCallback(
    async (table: CachedTable) => {
      // El borrador se crea antes de pintar la pantalla: si el celular se apaga en este
      // instante, la mesa ya quedó abierta localmente.
      await openDraft(table);
      navigate({ screen: "order", tableId: table.tableId, tableLabel: table.tableLabel });
    },
    [navigate],
  );

  const title =
    view.screen === "tables"
      ? "Mis mesas"
      : view.screen === "conflicts"
        ? "Sin resolver"
        : `Mesa ${view.tableLabel}`;

  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-background sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-2">
        {view.screen === "tables" ? (
          <span className="px-2 font-semibold">{title}</span>
        ) : (
          <Button variant="ghost" size="sm" onClick={goBack} className="gap-1">
            <ChevronLeft className="size-4" />
            {title}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1">
          <SyncBadge onShowConflicts={() => navigate({ screen: "conflicts" })} />
          <MeseroLogout />
        </div>
      </div>

      {view.screen === "tables" ? (
        <TablesScreen waiterId={waiterId} onOpenTable={(table) => void onOpenTable(table)} />
      ) : null}

      {view.screen === "order" ? (
        <OrderScreen
          tableId={view.tableId}
          onBack={goBack}
          onAddItems={(orderId) =>
            navigate({
              screen: "menu",
              tableId: view.tableId,
              tableLabel: view.tableLabel,
              orderId,
            })
          }
        />
      ) : null}

      {view.screen === "menu" ? (
        <MenuPicker orderId={view.orderId} onDone={goBack} />
      ) : null}

      {view.screen === "conflicts" ? <ConflictsScreen onBack={goBack} /> : null}
    </div>
  );
}
