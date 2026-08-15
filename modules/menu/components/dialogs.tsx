"use client";

import { Field, FormDialog } from "@/components/layout/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  createCategory,
  createMenuItem,
  createVariant,
  updateCategory,
  updateMenuItem,
  updateVariant,
} from "../actions";
import type { MenuCategory, MenuItemWithVariants, MenuVariant } from "../queries";

/** Select nativo: el del sistema de diseño exige estado controlado y aquí basta el form. */
function CategorySelect({
  categories,
  defaultValue,
}: {
  categories: MenuCategory[];
  defaultValue?: string | null;
}) {
  return (
    <select
      id="category_id"
      name="category_id"
      defaultValue={defaultValue ?? ""}
      className="border-input bg-background h-9 rounded-md border px-3 text-sm"
    >
      <option value="">Sin categoría</option>
      {categories
        .filter((c) => c.is_active)
        .map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
    </select>
  );
}

// -----------------------------------------------------------------------------
// Categorías
// -----------------------------------------------------------------------------

export function CreateCategoryDialog() {
  return (
    <FormDialog
      trigger={<Button variant="outline">Nueva categoría</Button>}
      title="Nueva categoría"
      description="Agrupa la carta para que el mesero no tenga que buscar en una lista larga."
      action={createCategory}
      submitLabel="Crear"
    >
      {(errors) => (
        <>
          <Field name="name" label="Nombre" error={errors.name}>
            <Input id="name" name="name" required autoFocus maxLength={40} placeholder="Fuertes" />
          </Field>
          <Field name="sort_order" label="Orden" error={errors.sort_order}>
            <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={0} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function EditCategoryDialog({ category }: { category: MenuCategory }) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="sm">
          Editar
        </Button>
      }
      title={`Editar ${category.name}`}
      action={updateCategory}
    >
      {(errors) => (
        <>
          <input type="hidden" name="id" value={category.id} />
          <Field name="name" label="Nombre" error={errors.name}>
            <Input id="name" name="name" required defaultValue={category.name} maxLength={40} />
          </Field>
          <Field name="sort_order" label="Orden" error={errors.sort_order}>
            <Input
              id="sort_order"
              name="sort_order"
              type="number"
              min={0}
              defaultValue={category.sort_order}
            />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

// -----------------------------------------------------------------------------
// Platos
// -----------------------------------------------------------------------------

function ItemFields({
  errors,
  categories,
  item,
}: {
  errors: Record<string, string>;
  categories: MenuCategory[];
  item?: MenuItemWithVariants;
}) {
  return (
    <>
      <Field name="name" label="Nombre" error={errors.name}>
        <Input
          id="name"
          name="name"
          required
          autoFocus={!item}
          maxLength={80}
          defaultValue={item?.name}
          placeholder="Bandeja Paisa"
        />
      </Field>

      <Field
        name="base_price"
        label="Precio de la porción normal"
        error={errors.base_price}
        hint="En pesos, sin puntos ni decimales. Las porciones más pequeñas se agregan aparte como variantes."
      >
        <Input
          id="base_price"
          name="base_price"
          type="number"
          min={0}
          step={1}
          required
          defaultValue={item?.base_price}
          placeholder="38000"
        />
      </Field>

      <Field name="category_id" label="Categoría" error={errors.category_id}>
        <CategorySelect categories={categories} defaultValue={item?.category_id} />
      </Field>

      <Field name="description" label="Descripción (opcional)" error={errors.description}>
        <Textarea
          id="description"
          name="description"
          maxLength={200}
          rows={2}
          defaultValue={item?.description ?? ""}
        />
      </Field>

      <Field name="sort_order" label="Orden" error={errors.sort_order}>
        <Input
          id="sort_order"
          name="sort_order"
          type="number"
          min={0}
          defaultValue={item?.sort_order ?? 0}
        />
      </Field>
    </>
  );
}

export function CreateMenuItemDialog({ categories }: { categories: MenuCategory[] }) {
  return (
    <FormDialog
      trigger={<Button>Nuevo plato</Button>}
      title="Nuevo plato"
      action={createMenuItem}
      submitLabel="Crear plato"
    >
      {(errors) => <ItemFields errors={errors} categories={categories} />}
    </FormDialog>
  );
}

export function EditMenuItemDialog({
  item,
  categories,
}: {
  item: MenuItemWithVariants;
  categories: MenuCategory[];
}) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="sm">
          Editar
        </Button>
      }
      title={`Editar ${item.name}`}
      description="Cambiar el precio no afecta pedidos ya tomados: cada línea guarda el precio con que se vendió."
      action={updateMenuItem}
    >
      {(errors) => (
        <>
          <input type="hidden" name="id" value={item.id} />
          <ItemFields errors={errors} categories={categories} item={item} />
        </>
      )}
    </FormDialog>
  );
}

// -----------------------------------------------------------------------------
// Variantes
// -----------------------------------------------------------------------------

export function CreateVariantDialog({ item }: { item: MenuItemWithVariants }) {
  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm">
          Agregar variante
        </Button>
      }
      title={`Variante de ${item.name}`}
      description="Una alternativa de menor precio, como media porción. La porción normal ya está en el plato: no la agregues aquí."
      action={createVariant}
      submitLabel="Agregar"
    >
      {(errors) => (
        <>
          <input type="hidden" name="menu_item_id" value={item.id} />
          <Field name="name" label="Nombre" error={errors.name}>
            <Input
              id="name"
              name="name"
              required
              autoFocus
              maxLength={40}
              placeholder="Media porción"
            />
          </Field>
          <Field name="price" label="Precio" error={errors.price}>
            <Input
              id="price"
              name="price"
              type="number"
              min={0}
              step={1}
              required
              placeholder="24000"
            />
          </Field>
          <Field name="sort_order" label="Orden" error={errors.sort_order}>
            <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={0} />
          </Field>
        </>
      )}
    </FormDialog>
  );
}

export function EditVariantDialog({ variant }: { variant: MenuVariant }) {
  return (
    <FormDialog
      trigger={
        <Button variant="ghost" size="sm">
          Editar
        </Button>
      }
      title={`Editar ${variant.name}`}
      action={updateVariant}
    >
      {(errors) => (
        <>
          <input type="hidden" name="id" value={variant.id} />
          <input type="hidden" name="menu_item_id" value={variant.menu_item_id} />
          <Field name="name" label="Nombre" error={errors.name}>
            <Input id="name" name="name" required defaultValue={variant.name} maxLength={40} />
          </Field>
          <Field name="price" label="Precio" error={errors.price}>
            <Input
              id="price"
              name="price"
              type="number"
              min={0}
              step={1}
              required
              defaultValue={variant.price}
            />
          </Field>
          <Field name="sort_order" label="Orden" error={errors.sort_order}>
            <Input
              id="sort_order"
              name="sort_order"
              type="number"
              min={0}
              defaultValue={variant.sort_order}
            />
          </Field>
        </>
      )}
    </FormDialog>
  );
}
