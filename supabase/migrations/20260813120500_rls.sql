-- =============================================================================
-- 06 · Row Level Security
-- =============================================================================
-- CONSECUENCIA ARQUITECTÓNICA A ACEPTAR EXPLÍCITAMENTE:
-- las vistas de mesero y de caja hablan DIRECTO con Postgres desde el navegador
-- (el mesero necesita funcionar aunque el servidor de Next no esté disponible, y
-- Realtime exige un WebSocket desde el cliente). Por lo tanto RLS es la ÚNICA
-- frontera de seguridad real: no puede existir ninguna regla de negocio que solo
-- se valide en el servidor de Next.
--
-- Se usa `enable row level security` pero NO `force`: los RPC son SECURITY DEFINER
-- y corren como el dueño de las tablas, que debe poder saltarse las políticas para
-- escribir totales y pagos. Con `force` los RPC dejarían de funcionar.
--
-- Estrategia de permisos: revocar todo y conceder lo mínimo, columna por columna
-- donde hace falta. Aunque una política resultara permisiva de más, un cliente no
-- puede tocar dinero ni estados porque el GRANT no existe.
-- =============================================================================

alter table public.profiles            enable row level security;
alter table public.dining_rooms        enable row level security;
alter table public.tables              enable row level security;
alter table public.menu_categories     enable row level security;
alter table public.menu_items          enable row level security;
alter table public.menu_item_variants  enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.orders              enable row level security;
alter table public.order_checks        enable row level security;
alter table public.order_items         enable row level security;
alter table public.payments            enable row level security;

revoke all on public.profiles, public.dining_rooms, public.tables,
              public.menu_categories, public.menu_items, public.menu_item_variants,
              public.restaurant_settings, public.orders, public.order_checks,
              public.order_items, public.payments
  from anon, authenticated;


-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- Todo el personal puede leer los nombres: Caja necesita el nombre del mesero en la
-- comanda y el mesero necesita ver quién tomó una mesa. No hay dato sensible aquí.
grant select on public.profiles to authenticated;
grant insert, update, delete on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated using (public.is_staff());

create policy profiles_admin_write on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- Configuración: salones, mesas, menú, ajustes
-- -----------------------------------------------------------------------------
grant select on public.dining_rooms, public.menu_categories, public.menu_items,
                public.menu_item_variants, public.restaurant_settings, public.tables
  to authenticated;
grant insert, update, delete on public.dining_rooms, public.menu_categories,
                                public.menu_items, public.menu_item_variants,
                                public.tables
  to authenticated;
grant update on public.restaurant_settings to authenticated;

create policy dining_rooms_select on public.dining_rooms
  for select to authenticated using (public.is_staff());
create policy dining_rooms_admin_write on public.dining_rooms
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy menu_categories_select on public.menu_categories
  for select to authenticated using (public.is_staff());
create policy menu_categories_admin_write on public.menu_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy menu_items_select on public.menu_items
  for select to authenticated using (public.is_staff());
create policy menu_items_admin_write on public.menu_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy menu_item_variants_select on public.menu_item_variants
  for select to authenticated using (public.is_staff());
create policy menu_item_variants_admin_write on public.menu_item_variants
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy settings_select on public.restaurant_settings
  for select to authenticated using (public.is_staff());
create policy settings_admin_write on public.restaurant_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Las mesas las lee TODO el personal, incluidos los meseros: restringirlas a "las
-- mías" rompería la pantalla de "elegir mesa", que existe justamente para ver las
-- libres. La escritura directa es de Caja/Admin (reasignar); el mesero toma mesa
-- con el RPC `claim_table`.
create policy tables_select on public.tables
  for select to authenticated using (public.is_staff());
create policy tables_caja_update on public.tables
  for update to authenticated
  using (public.is_caja_or_admin()) with check (public.is_caja_or_admin());
create policy tables_admin_write on public.tables
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
-- Lo único que un cliente puede escribir directamente es la nota del pedido. Estado,
-- totales, impresión y cierre pasan sí o sí por los RPC — por eso NO se concede
-- INSERT ni UPDATE sobre ninguna otra columna.
grant select on public.orders to authenticated;
grant update (note) on public.orders to authenticated;

create policy orders_select on public.orders
  for select to authenticated
  using (public.is_caja_or_admin() or status <> 'cerrado' or waiter_id = auth.uid());

create policy orders_update_note on public.orders
  for update to authenticated
  using (public.can_edit_order(id))
  with check (public.can_edit_order(id));


-- -----------------------------------------------------------------------------
-- order_checks · solo lectura para los clientes; se escriben vía split_order / close_check
-- -----------------------------------------------------------------------------
grant select on public.order_checks to authenticated;

create policy order_checks_select on public.order_checks
  for select to authenticated using (public.can_view_order(order_id));


-- -----------------------------------------------------------------------------
-- order_items
-- -----------------------------------------------------------------------------
-- INSERT no se concede: todas las líneas entran por `submit_order`, que es quien
-- resuelve y congela el precio. Caja agrega platos con el MISMO RPC.
grant select on public.order_items to authenticated;
grant update (qty, note) on public.order_items to authenticated;
grant delete on public.order_items to authenticated;

create policy order_items_select on public.order_items
  for select to authenticated using (public.can_view_order(order_id));

-- Ajustar cantidad o nota solo mientras la línea no haya ido a Cocina.
create policy order_items_update_unprinted on public.order_items
  for update to authenticated
  using (public.can_edit_order(order_id) and printed_at is null and voided_at is null)
  with check (public.can_edit_order(order_id) and printed_at is null and voided_at is null);

-- Borrar solo lo que aún NO se imprimió. Lo impreso ya está en Cocina: se anula con
-- `void_order_item` (solo Caja) y queda registrado.
create policy order_items_delete_unprinted on public.order_items
  for delete to authenticated
  using (public.can_edit_order(order_id) and printed_at is null and voided_at is null);


-- -----------------------------------------------------------------------------
-- payments · el mesero no ve dinero
-- -----------------------------------------------------------------------------
-- Sin INSERT/UPDATE/DELETE para nadie: la única forma de registrar un pago es
-- `close_check`, que valida en la misma transacción que la suma cuadre con el total.
grant select on public.payments to authenticated;

create policy payments_select on public.payments
  for select to authenticated using (public.is_caja_or_admin());
