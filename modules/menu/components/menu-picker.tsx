"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { db } from "@/modules/offline/db";
import { addItem } from "@/modules/pedidos/drafts";

import { MenuPickerView } from "./menu-picker-view";

/**
 * La carta para el MESERO: se lee del caché de IndexedDB y lo elegido se escribe en el
 * borrador local, sin tocar la red.
 *
 * La pantalla en sí es `MenuPickerView`, compartida con Caja.
 */
export function MenuPicker({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const menu = useLiveQuery(() => db.menu.get("current"), [], undefined);
  const [added, setAdded] = useState(0);

  if (menu === undefined) {
    return <p className="text-muted-foreground p-4 text-sm">Cargando carta…</p>;
  }

  return (
    <MenuPickerView
      categories={menu?.categories ?? []}
      items={menu?.items ?? []}
      emptyMessage="La carta no está guardada en este celular todavía. Conéctate una vez para descargarla."
      onPick={async ({ item, variant, unitPrice }) => {
        await addItem(orderId, {
          menuItemId: item.id,
          variantId: variant?.id ?? null,
          itemName: item.name,
          variantName: variant?.name ?? null,
          // Precio solo para pintar: el servidor lo resuelve y lo congela él mismo, así
          // que una carta cacheada vieja no puede cobrar de menos.
          unitPrice,
        });
        setAdded((n) => n + 1);
      }}
      footer={
        <div className="bg-background fixed inset-x-0 bottom-0 border-t p-4">
          <div className="mx-auto max-w-2xl">
            <Button className="h-14 w-full text-base" onClick={onDone}>
              Listo{added > 0 ? ` · ${added} agregado(s)` : ""}
            </Button>
          </div>
        </div>
      }
    />
  );
}
