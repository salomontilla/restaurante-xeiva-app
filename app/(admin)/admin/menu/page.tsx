import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatMoney } from "@/lib/money";
import { setCategoryActive, setMenuItemActive, setVariantActive } from "@/modules/menu/actions";
import {
  CreateCategoryDialog,
  CreateMenuItemDialog,
  CreateVariantDialog,
  EditCategoryDialog,
  EditMenuItemDialog,
  EditVariantDialog,
} from "@/modules/menu/components/dialogs";
import { listCategories, listMenuItems, type MenuItemWithVariants } from "@/modules/menu/queries";
import { ToggleActive } from "@/modules/salones-mesas/components/toggle-active";

export const metadata = { title: "Carta · Xeiva" };

export default async function MenuPage() {
  const [categories, items] = await Promise.all([listCategories(), listMenuItems()]);

  // Los platos sin categoría van al final, en su propio grupo.
  const groups: { id: string | null; name: string; items: MenuItemWithVariants[] }[] = [
    ...categories.map((category) => ({
      id: category.id,
      name: category.name,
      items: items.filter((item) => item.category_id === category.id),
    })),
    {
      id: null,
      name: "Sin categoría",
      items: items.filter((item) => item.category_id === null),
    },
  ].filter((group) => group.items.length > 0 || group.id !== null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Carta</h1>
          <p className="text-muted-foreground text-sm">
            El precio del plato es el de la porción normal. Las porciones más pequeñas se
            agregan como variantes, y el mesero solo las selecciona.
          </p>
        </div>
        <div className="flex gap-2">
          <CreateCategoryDialog />
          <CreateMenuItemDialog categories={categories} />
        </div>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            La carta está vacía. Crea el primer plato para que el mesero tenga qué pedir.
          </CardContent>
        </Card>
      ) : null}

      {groups.map((group) => {
        const category = categories.find((c) => c.id === group.id);

        return (
          <section key={group.id ?? "sin-categoria"} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
                {group.name}
              </h2>
              {category && !category.is_active ? <Badge variant="outline">De baja</Badge> : null}
              {category ? (
                <span className="flex items-center">
                  <EditCategoryDialog category={category} />
                  <ToggleActive
                    id={category.id}
                    active={category.is_active}
                    action={setCategoryActive}
                    activeLabel="Baja"
                  />
                </span>
              ) : null}
            </div>

            {group.items.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin platos en esta categoría.</p>
            ) : null}

            <div className="grid gap-3 lg:grid-cols-2">
              {group.items.map((item) => {
                const variants = item.menu_item_variants.filter((v) => v.is_active);
                const inactiveVariants = item.menu_item_variants.filter((v) => !v.is_active);

                return (
                  <Card key={item.id} className={item.is_active ? undefined : "opacity-60"}>
                    <CardHeader className="flex flex-row items-start justify-between gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {item.name}
                          {item.is_active ? null : <Badge variant="outline">De baja</Badge>}
                        </CardTitle>
                        <p className="mt-1 font-medium">{formatMoney(item.base_price)}</p>
                        {item.description ? (
                          <p className="text-muted-foreground mt-1 text-sm">{item.description}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center">
                        <EditMenuItemDialog item={item} categories={categories} />
                        <ToggleActive
                          id={item.id}
                          active={item.is_active}
                          action={setMenuItemActive}
                          activeLabel="Baja"
                        />
                      </div>
                    </CardHeader>

                    <CardContent className="flex flex-col gap-2">
                      <Separator />

                      {variants.length === 0 ? (
                        <p className="text-muted-foreground text-sm">
                          Sin variantes. Solo se vende en porción normal.
                        </p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {variants.map((variant) => (
                            <li
                              key={variant.id}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              <span>
                                {variant.name} · {formatMoney(variant.price)}
                              </span>
                              <span className="flex items-center">
                                <EditVariantDialog variant={variant} />
                                <ToggleActive
                                  id={variant.id}
                                  active={variant.is_active}
                                  action={setVariantActive}
                                  activeLabel="Baja"
                                />
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {inactiveVariants.length > 0 ? (
                        <details className="text-muted-foreground text-sm">
                          <summary className="cursor-pointer">
                            {inactiveVariants.length} variante(s) dadas de baja
                          </summary>
                          <ul className="mt-1 flex flex-col gap-1">
                            {inactiveVariants.map((variant) => (
                              <li key={variant.id} className="flex items-center justify-between">
                                <span>
                                  {variant.name} · {formatMoney(variant.price)}
                                </span>
                                <ToggleActive
                                  id={variant.id}
                                  active={variant.is_active}
                                  action={setVariantActive}
                                />
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}

                      <div>
                        <CreateVariantDialog item={item} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
