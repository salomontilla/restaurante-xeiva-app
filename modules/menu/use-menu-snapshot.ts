"use client";

import { useEffect, useState } from "react";

import { getBrowserClient } from "@/lib/supabase/browser";

import type { MenuSnapshot } from "./types";

/**
 * La carta para Caja.
 *
 * Usa el mismo RPC `get_menu_snapshot()` que el mesero, pero sin cachear en IndexedDB:
 * Caja está en una estación fija con red, y una carta vieja aquí solo causaría
 * confusión. Se pide cuando se abre el selector y ya.
 */
export function useMenuSnapshot(enabled: boolean) {
  const [menu, setMenu] = useState<MenuSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || menu) return;

    let cancelled = false;

    void (async () => {
      const { data, error: rpcError } = await getBrowserClient().rpc("get_menu_snapshot");
      if (cancelled) return;

      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      setMenu(data as unknown as MenuSnapshot);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, menu]);

  return { menu, error };
}
