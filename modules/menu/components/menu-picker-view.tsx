"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

import type { MenuCategoryOption, MenuItemOption, MenuPick } from "../types";

/**
 * Selector de platos y variantes. Lo usan el mesero y Caja.
 *
 * No sabe de dónde salió la carta ni qué se hace con lo elegido: recibe los datos y
 * avisa por `onPick`. El mesero lo envuelve escribiendo en IndexedDB; Caja lo envuelve
 * llamando a `submit_order` directamente.
 *
 * Un plato sin variantes se agrega de un solo toque, que es el 90% de los casos. Uno
 * con variantes abre una hoja para elegir entre la porción normal (el `base_price` del
 * plato) y las alternativas que predefinió el admin. Nunca se escribe una variante a
 * mano: solo se selecciona.
 */
export function MenuPickerView({
  categories,
  items,
  onPick,
  footer,
  emptyMessage = "La carta está vacía.",
}: {
  categories: MenuCategoryOption[];
  items: MenuItemOption[];
  onPick: (pick: MenuPick) => void | Promise<void>;
  footer?: ReactNode;
  emptyMessage?: string;
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [variantsFor, setVariantsFor] = useState<MenuItemOption | null>(null);

  if (items.length === 0) {
    return <p className="text-muted-foreground p-4 text-sm">{emptyMessage}</p>;
  }

  const visible = categoryId ? items.filter((item) => item.category_id === categoryId) : items;

  async function pick(item: MenuItemOption, variantId: string | null) {
    const variant = item.variants.find((v) => v.id === variantId) ?? null;
    setVariantsFor(null);
    await onPick({ item, variant, unitPrice: variant?.price ?? item.base_price });
  }

  return (
    <div className="flex flex-1 flex-col">
      {categories.length > 0 ? (
        <div className="bg-background sticky top-14 z-10 flex gap-2 overflow-x-auto border-b p-3">
          <CategoryChip active={categoryId === null} onClick={() => setCategoryId(null)}>
            Todo
          </CategoryChip>
          {categories.map((category) => (
            <CategoryChip
              key={category.id}
              active={categoryId === category.id}
              onClick={() => setCategoryId(category.id)}
            >
              {category.name}
            </CategoryChip>
          ))}
        </div>
      ) : null}

      <ul className="flex flex-col gap-2 p-4 pb-28">
        {visible.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() =>
                item.variants.length > 0 ? setVariantsFor(item) : void pick(item, null)
              }
              className="hover:bg-accent flex min-h-16 w-full items-center justify-between gap-3 rounded-lg border p-3 text-left"
            >
              <span className="min-w-0">
                <span className="block font-medium">{item.name}</span>
                {item.description ? (
                  <span className="text-muted-foreground block truncate text-xs">
                    {item.description}
                  </span>
                ) : null}
                {item.variants.length > 0 ? (
                  <span className="text-muted-foreground block text-xs">
                    {item.variants.length} variante(s)
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {formatMoney(item.base_price)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {footer}

      <Dialog open={variantsFor !== null} onOpenChange={(open) => !open && setVariantsFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{variantsFor?.name}</DialogTitle>
            <DialogDescription>Elige la porción.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {/* La porción normal NO es una variante: es el precio base del plato. */}
            <Button
              variant="outline"
              className="h-14 justify-between text-base"
              onClick={() => variantsFor && void pick(variantsFor, null)}
            >
              <span>Porción normal</span>
              <span className="tabular-nums">{formatMoney(variantsFor?.base_price ?? 0)}</span>
            </Button>

            {variantsFor?.variants.map((variant) => (
              <Button
                key={variant.id}
                variant="outline"
                className="h-14 justify-between text-base"
                onClick={() => variantsFor && void pick(variantsFor, variant.id)}
              >
                <span>{variant.name}</span>
                <span className="tabular-nums">{formatMoney(variant.price)}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-10 shrink-0 rounded-full border px-4 text-sm font-medium",
        active ? "bg-primary text-primary-foreground border-primary" : "bg-background",
      )}
    >
      {children}
    </button>
  );
}
