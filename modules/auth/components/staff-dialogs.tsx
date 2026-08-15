"use client";

import { Field, FormDialog } from "@/components/layout/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { createStaffUser, renameStaff, resetStaffPassword } from "../actions";
import type { Profile } from "../types";

export function CreateStaffDialog() {
  return (
    <FormDialog
      trigger={<Button>Nueva cuenta</Button>}
      title="Nueva cuenta"
      description="La persona entra con este correo y contraseña. No hay registro por cuenta propia ni correo de confirmación."
      action={createStaffUser}
      submitLabel="Crear cuenta"
    >
      {(errors) => (
        <>
          <Field name="full_name" label="Nombre" error={errors.full_name}>
            <Input
              id="full_name"
              name="full_name"
              required
              autoFocus
              maxLength={80}
              placeholder="Juan Pérez"
            />
          </Field>

          <Field
            name="email"
            label="Correo"
            error={errors.email}
            hint="No necesita ser un correo real: sirve como nombre de usuario."
          >
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoCapitalize="none"
              placeholder="juan@xeiva.local"
            />
          </Field>

          <Field name="password" label="Contraseña" error={errors.password}>
            <Input id="password" name="password" type="text" required minLength={6} />
          </Field>

          <Field name="role" label="Rol" error={errors.role}>
            <select
              id="role"
              name="role"
              defaultValue="mesero"
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="mesero">Mesero</option>
              <option value="caja">Caja</option>
            </select>
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function RenameStaffDialog({ profile }: { profile: Profile }) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="sm">
          Renombrar
        </Button>
      }
      title={`Renombrar a ${profile.full_name}`}
      action={renameStaff}
    >
      {(errors) => (
        <>
          <input type="hidden" name="id" value={profile.id} />
          <Field name="full_name" label="Nombre" error={errors.full_name}>
            <Input
              id="full_name"
              name="full_name"
              required
              autoFocus
              maxLength={80}
              defaultValue={profile.full_name}
            />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function ResetPasswordDialog({ profile }: { profile: Profile }) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="sm">
          Cambiar clave
        </Button>
      }
      title={`Nueva contraseña para ${profile.full_name}`}
      description="Se la tienes que decir a la persona: no se envía ningún correo."
      action={resetStaffPassword}
      submitLabel="Cambiar"
    >
      {(errors) => (
        <>
          <input type="hidden" name="id" value={profile.id} />
          <Field name="password" label="Contraseña" error={errors.password}>
            <Input id="password" name="password" type="text" required minLength={6} autoFocus />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
