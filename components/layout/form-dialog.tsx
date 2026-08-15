"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionResult } from "@/lib/action-result";

type FormAction = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/**
 * Diálogo con formulario conectado a una Server Action.
 *
 * Los seis CRUD del admin (salones, mesas, platos, variantes, meseros) comparten la
 * misma mecánica: abrir, enviar, mostrar errores por campo, cerrar al tener éxito.
 * Esto lo centraliza para que agregar un CRUD sea escribir sus campos y nada más.
 *
 * `children` recibe los errores por campo para poder pintarlos junto a cada input.
 */
export function FormDialog({
  trigger,
  title,
  description,
  action,
  submitLabel = "Guardar",
  children,
}: {
  /** El shadcn de este proyecto usa Base UI, que compone con `render`, no con `asChild`. */
  trigger: ReactElement;
  title: string;
  description?: string;
  action: FormAction;
  submitLabel?: string;
  children: (errors: Record<string, string>) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {/*
          La `key` monta el formulario de nuevo en cada apertura. Sin eso, `useActionState`
          conservaría los errores del intento anterior y el usuario los vería al reabrir.
        */}
        <DialogForm
          key={String(open)}
          action={action}
          submitLabel={submitLabel}
          onDone={close}
        >
          {children}
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

function DialogForm({
  action,
  submitLabel,
  onDone,
  children,
}: {
  action: FormAction;
  submitLabel: string;
  onDone: () => void;
  children: (errors: Record<string, string>) => ReactNode;
}) {
  const [state, formAction] = useActionState(action, null);

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {children(state?.fieldErrors ?? {})}

      {state?.ok === false && state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <DialogFooter>
        <SubmitButton>{submitLabel}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

/** Label + control + mensaje de error, que es el 90% de los campos del admin. */
export function Field({
  name,
  label,
  error,
  hint,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {hint && !error ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
