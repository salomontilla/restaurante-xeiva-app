"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

/**
 * Activar / dar de baja. No hay botón de borrar en ninguna parte del admin: los
 * pedidos históricos referencian salones, mesas y platos, y borrarlos rompería
 * recibos y reportes ya emitidos (las FK con ON DELETE RESTRICT lo impiden).
 *
 * La acción llega como prop desde el Server Component, así el mismo botón sirve para
 * salones, mesas, platos y variantes.
 */
export function ToggleActive({
  id,
  active,
  action,
  activeLabel = "Dar de baja",
  inactiveLabel = "Reactivar",
}: {
  id: string;
  active: boolean;
  action: (id: string, active: boolean) => Promise<ActionResult>;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await action(id, !active);
      if (!result.ok) toast.error(result.error ?? "No se pudo completar la operación");
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending}>
      {active ? activeLabel : inactiveLabel}
    </Button>
  );
}
