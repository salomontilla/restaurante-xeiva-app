"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Cierra sesión desde el navegador para que se borren las cookies Y el estado del
 * cliente de Supabase (incluida cualquier suscripción de Realtime abierta).
 */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    await getBrowserClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={pending}>
      {pending ? "Saliendo…" : "Salir"}
    </Button>
  );
}
