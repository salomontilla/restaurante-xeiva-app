"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

/**
 * Botón de envío que se deshabilita solo mientras la acción está en vuelo.
 * Usa `useFormStatus`, así que tiene que estar DENTRO del <form>.
 */
export function SubmitButton({
  children,
  pendingLabel = "Guardando…",
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
