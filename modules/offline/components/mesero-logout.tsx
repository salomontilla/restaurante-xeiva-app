"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { getBrowserClient } from "@/lib/supabase/browser";

import { clearLocalData } from "../db";
import { countPending } from "../outbox";
import { clearServiceWorkerCaches } from "./service-worker-registrar";

/**
 * Salir desde el celular del mesero.
 *
 * Dos cuidados que el botón normal de salir no tiene:
 *
 *   1. Si quedan envíos pendientes, avisa. Salir con la cola llena significa que esos
 *      platos no llegaron a Caja y nadie se va a enterar.
 *   2. Borra IndexedDB. El mismo celular puede pasar de un mesero a otro entre turnos y
 *      los borradores de uno no pueden aparecerle al siguiente.
 */
export function MeseroLogout() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);

    const queued = await countPending();
    if (queued > 0 && !confirming) {
      setConfirming(true);
      setPending(false);
      toast.warning(
        `Quedan ${queued} envío(s) sin llegar a Caja. Toca otra vez para salir de todas formas.`,
      );
      return;
    }

    await clearLocalData();
    await clearServiceWorkerCaches();
    await getBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => void onClick()}
      disabled={pending}
      aria-label="Salir"
      className={confirming ? "text-destructive" : undefined}
    >
      <LogOut className="size-4" />
    </Button>
  );
}
