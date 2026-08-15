"use client";

import { Field, FormDialog } from "@/components/layout/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  createRoom,
  createTable,
  createTablesBulk,
  updateRoom,
  updateTable,
} from "../actions";
import type { RestaurantTable, RoomWithTables } from "../queries";

export function CreateRoomDialog() {
  return (
    <FormDialog
      trigger={<Button>Nuevo salón</Button>}
      title="Nuevo salón"
      description="Por ejemplo: Mango, Frente, Terraza."
      action={createRoom}
      submitLabel="Crear salón"
    >
      {(errors) => (
        <>
          <Field name="name" label="Nombre" error={errors.name}>
            <Input id="name" name="name" required autoFocus maxLength={60} />
          </Field>
          <Field
            name="sort_order"
            label="Orden"
            error={errors.sort_order}
            hint="Define en qué posición aparece el salón en las listas."
          >
            <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={0} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function EditRoomDialog({ room }: { room: RoomWithTables }) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="sm">
          Editar
        </Button>
      }
      title={`Editar ${room.name}`}
      action={updateRoom}
    >
      {(errors) => (
        <>
          <input type="hidden" name="id" value={room.id} />
          <Field name="name" label="Nombre" error={errors.name}>
            <Input id="name" name="name" required defaultValue={room.name} maxLength={60} />
          </Field>
          <Field name="sort_order" label="Orden" error={errors.sort_order}>
            <Input
              id="sort_order"
              name="sort_order"
              type="number"
              min={0}
              defaultValue={room.sort_order}
            />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function CreateTableDialog({ roomId }: { roomId: string }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm">
          Agregar mesa
        </Button>
      }
      title="Nueva mesa"
      action={createTable}
      submitLabel="Crear mesa"
    >
      {(errors) => (
        <>
          <input type="hidden" name="dining_room_id" value={roomId} />
          <Field
            name="label"
            label="Nombre o número"
            error={errors.label}
            hint='Lo que el personal usa para nombrarla: "5", "A3", "Barra".'
          >
            <Input id="label" name="label" required autoFocus maxLength={20} />
          </Field>
          <Field name="seats" label="Puestos (opcional)" error={errors.seats}>
            <Input id="seats" name="seats" type="number" min={1} placeholder="4" />
          </Field>
          <Field name="sort_order" label="Orden" error={errors.sort_order}>
            <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={0} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

/**
 * Montar un salón mesa por mesa es tedioso y es algo que se hace una sola vez al
 * configurar el local, así que existe la creación por rango.
 */
export function BulkTablesDialog({ roomId }: { roomId: string }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm">
          Crear varias
        </Button>
      }
      title="Crear varias mesas"
      description="Crea una numeración corrida de una sola vez."
      action={createTablesBulk}
      submitLabel="Crear mesas"
    >
      {(errors) => (
        <>
          <input type="hidden" name="dining_room_id" value={roomId} />
          <Field
            name="prefix"
            label="Prefijo (opcional)"
            error={errors.prefix}
            hint='Con prefijo "F" y rango 1 a 5 crea F1, F2, F3, F4, F5.'
          >
            <Input id="prefix" name="prefix" maxLength={10} placeholder="F" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field name="from" label="Desde" error={errors.from}>
              <Input id="from" name="from" type="number" min={1} defaultValue={1} required />
            </Field>
            <Field name="to" label="Hasta" error={errors.to}>
              <Input id="to" name="to" type="number" min={1} defaultValue={8} required />
            </Field>
          </div>
          <Field name="seats" label="Puestos por mesa (opcional)" error={errors.seats}>
            <Input id="seats" name="seats" type="number" min={1} placeholder="4" />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function EditTableDialog({
  table,
  roomId,
}: {
  table: Pick<RestaurantTable, "id" | "label" | "seats" | "sort_order">;
  roomId: string;
}) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="sm">
          Editar
        </Button>
      }
      title={`Editar mesa ${table.label}`}
      action={updateTable}
    >
      {(errors) => (
        <>
          <input type="hidden" name="id" value={table.id} />
          <input type="hidden" name="dining_room_id" value={roomId} />
          <Field name="label" label="Nombre o número" error={errors.label}>
            <Input id="label" name="label" required defaultValue={table.label} maxLength={20} />
          </Field>
          <Field name="seats" label="Puestos (opcional)" error={errors.seats}>
            <Input
              id="seats"
              name="seats"
              type="number"
              min={1}
              defaultValue={table.seats ?? ""}
            />
          </Field>
          <Field name="sort_order" label="Orden" error={errors.sort_order}>
            <Input
              id="sort_order"
              name="sort_order"
              type="number"
              min={0}
              defaultValue={table.sort_order}
            />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
