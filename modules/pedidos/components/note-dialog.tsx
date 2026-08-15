"use client";

import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * Observación de una línea del pedido ("sin cebolla", "término medio").
 *
 * Los atajos NO son un catálogo administrable: solo rellenan el campo, que sigue siendo
 * editable. Un catálogo cerrado garantizaría que algún día el mesero no pueda escribir
 * "sin cebolla pero con doble tomate" — y entonces lo gritaría a la cocina, que es justo
 * lo que el sistema debía evitar. Aquí el texto libre es correcto porque la nota no
 * toca el precio; esa era la razón de prohibirlo en las variantes.
 *
 * Se afinan preguntándole al cocinero cuáles son las de verdad, editando este arreglo.
 */
const PRESETS = [
  "Sin cebolla",
  "Sin cilantro",
  "Sin picante",
  "Sin sal",
  "Término medio",
  "Bien asado",
  "Para llevar",
  "Aparte",
];

/** Mismo tope que el CHECK de la base: la comanda es de ancho fijo. */
const MAX = 120;

export function NoteDialog({
  itemName,
  note,
  onSave,
  triggerLabel,
}: {
  itemName: string;
  note: string | null;
  onSave: (note: string | null) => void | Promise<void>;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(note ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave(value.trim() === "" ? null : value.trim().slice(0, MAX));
    setSaving(false);
    setOpen(false);
  }

  function addPreset(preset: string) {
    setValue((current) => {
      const trimmed = current.trim();
      if (trimmed === "") return preset;
      if (trimmed.toLowerCase().includes(preset.toLowerCase())) return trimmed;
      return `${trimmed}, ${preset}`.slice(0, MAX);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setValue(note ?? "");
      }}
    >
      <DialogTrigger
        render={
          <Button variant={note ? "secondary" : "ghost"} size="sm" className="gap-1">
            <MessageSquarePlus className="size-4" />
            {triggerLabel ?? (note ? "Nota" : "")}
          </Button>
        }
      />

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Observación · {itemName}</DialogTitle>
          <DialogDescription>
            Se imprime destacada junto al plato en la comanda de Cocina.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => addPreset(preset)}
              className="hover:bg-accent h-10 rounded-full border px-3 text-sm"
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={MAX}
            rows={3}
            placeholder="Escribe o toca un atajo…"
            autoFocus
          />
          <span className="text-muted-foreground self-end text-xs tabular-nums">
            {value.length}/{MAX}
          </span>
        </div>

        <DialogFooter>
          {note ? (
            <Button
              variant="ghost"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                await onSave(null);
                setSaving(false);
                setValue("");
                setOpen(false);
              }}
            >
              Quitar nota
            </Button>
          ) : null}
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
