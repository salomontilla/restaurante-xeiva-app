-- =============================================================================
-- 05 · RPC — las operaciones del negocio
-- =============================================================================
-- Regla del proyecto: las LECTURAS simples van por query directa con RLS; toda
-- ESCRITURA que toque más de una tabla, o que involucre dinero o cambios de estado,
-- pasa por un RPC. El INSERT directo sobre `payments` y sobre `orders` está revocado
-- (ver 06_rls.sql), así que estos son el único camino.
--
-- Convención de errores: los casos de negocio esperados NO lanzan excepción, devuelven
-- `{ ok: false, code: '...' }`. Es deliberado: el cliente offline del mesero necesita
-- distinguir un error de negocio (mostrárselo a la persona, no reintentar) de uno de
-- red (reintentar solo). Ver `lib/result.ts`.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- claim_table · el mesero toma una mesa libre
-- -----------------------------------------------------------------------------
-- Es la ÚNICA acción del mesero que exige conexión: dos meseros sin señal no pueden
-- resolver entre sí quién tomó la mesa 5. La UI bloquea tomar mesas nuevas estando
-- offline, pero deja seguir agregando platos a las que ya son suyas.
create or replace function public.claim_table(p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_rows  int;
  v_owner uuid;
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  update public.tables
     set assigned_waiter_id = v_uid
   where id = p_table_id
     and is_active
     and assigned_waiter_id is null;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    select assigned_waiter_id into v_owner from public.tables where id = p_table_id and is_active;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
    -- Reintento del propio mesero: idempotente, no es un error.
    if v_owner <> v_uid then
      return jsonb_build_object('ok', false, 'code', 'TABLE_TAKEN', 'owner_id', v_owner);
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'code', null,
    'table', (select to_jsonb(t) from public.tables t where t.id = p_table_id)
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- get_menu_snapshot · la carta completa en una sola llamada
-- -----------------------------------------------------------------------------
-- Existe específicamente para el caché offline del PWA: trae todo el menú anidado
-- con una `version`, para que el celular decida si necesita re-descargarlo. Evita
-- N+1 y evita que el cliente arme el árbol.
create or replace function public.get_menu_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'version', (select menu_version from public.restaurant_settings where id),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order)
                       order by c.sort_order, c.name)
        from public.menu_categories c where c.is_active
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', mi.id,
               'category_id', mi.category_id,
               'name', mi.name,
               'description', mi.description,
               'base_price', mi.base_price,
               'sort_order', mi.sort_order,
               'variants', coalesce((
                 select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price', v.price)
                                  order by v.sort_order, v.name)
                   from public.menu_item_variants v
                  where v.menu_item_id = mi.id and v.is_active
               ), '[]'::jsonb)
             ) order by mi.sort_order, mi.name)
        from public.menu_items mi where mi.is_active
    ), '[]'::jsonb)
  )
$$;


-- -----------------------------------------------------------------------------
-- submit_order · LA operación central del sistema
-- -----------------------------------------------------------------------------
-- Crea el pedido si no existe y le agrega las líneas nuevas. Es la única operación
-- que el outbox offline necesita conocer: "tomé el pedido" y "agregué dos cervezas"
-- son la misma llamada, lo que hace que la cola sea homogénea y reintentable en orden.
--
-- IDEMPOTENCIA: los ids de pedido y de líneas los genera el celular ANTES de tocar la
-- red (uuid v7). Reintentar el mismo envío choca contra la PK y no hace nada. No hace
-- falta tabla de idempotency keys ni deduplicación por contenido.
--
-- `ON CONFLICT DO NOTHING` y no `DO UPDATE`: un reintento no debe pisar cambios que
-- Caja ya hizo sobre el pedido mientras el mesero estaba sin señal. Desde el mesero,
-- el pedido es append-only.
--
-- LOS PRECIOS LOS RESUELVE EL SERVIDOR. El payload manda menu_item_id + variant_id +
-- qty, nunca precios: un celular con la carta cacheada vieja mandaría precios
-- desactualizados, y un cliente manipulado podría cobrar $0.
create or replace function public.submit_order(p_order jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_role      public.user_role := public.app_role();
  v_order_id  uuid := nullif(p_order->>'id', '')::uuid;
  v_table_id  uuid := nullif(p_order->>'table_id', '')::uuid;
  v_client_at timestamptz := coalesce(nullif(p_order->>'client_created_at', '')::timestamptz, now());
  v_table     public.tables;
  v_order     public.orders;
  v_check_id  uuid;
  v_open_id   uuid;
begin
  if v_role is null then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if v_order_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select * into v_order from public.orders where id = v_order_id for update;

  if found then
    -- Reintento o adición sobre un pedido que ya existe.
    if v_order.status in ('cerrado', 'anulado') then
      return jsonb_build_object('ok', false, 'code', 'ORDER_CLOSED', 'order_id', v_order.id);
    end if;
  else
    select * into v_table from public.tables where id = v_table_id and is_active for update;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;

    -- Un mesero no puede abrir pedido en una mesa que tomó otro.
    if v_role = 'mesero'
       and v_table.assigned_waiter_id is not null
       and v_table.assigned_waiter_id <> v_uid then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
    end if;

    select o.id into v_open_id
      from public.orders o
     where o.table_id = v_table_id and o.status in ('pendiente', 'impreso', 'en_mesa')
     limit 1;

    if v_open_id is not null then
      -- La mesa ya tenía otro pedido abierto. La UI ofrece fusionar: reenviar las
      -- mismas líneas con ese order_id (las líneas conservan su uuid, sigue siendo
      -- idempotente).
      return jsonb_build_object('ok', false, 'code', 'TABLE_ALREADY_OPEN',
                                'current_order_id', v_open_id);
    end if;

    -- Mesa libre y sin dueño: el mesero la toma automáticamente al abrirla.
    if v_table.assigned_waiter_id is null and v_role = 'mesero' then
      update public.tables set assigned_waiter_id = v_uid where id = v_table_id;
      v_table.assigned_waiter_id := v_uid;
    end if;

    begin
      insert into public.orders (id, table_id, dining_room_id, table_label, waiter_id,
                                 note, client_created_at, created_by)
      values (v_order_id, v_table_id, v_table.dining_room_id, v_table.label,
              v_table.assigned_waiter_id, nullif(p_order->>'note', ''), v_client_at, v_uid)
      on conflict (id) do nothing;
    exception when unique_violation then
      -- Carrera: otro envío abrió pedido en esta mesa entre el SELECT y el INSERT.
      select o.id into v_open_id from public.orders o
       where o.table_id = v_table_id and o.status in ('pendiente', 'impreso', 'en_mesa') limit 1;
      return jsonb_build_object('ok', false, 'code', 'TABLE_ALREADY_OPEN',
                                'current_order_id', v_open_id);
    end;

    -- Todo pedido nace con una subcuenta. Si nadie divide, es la cuenta completa y
    -- el usuario nunca ve el concepto.
    insert into public.order_checks (order_id, seq) values (v_order_id, 1)
      on conflict (order_id, seq) do nothing;
  end if;

  if not public.can_edit_order(v_order_id) then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  -- Las líneas nuevas entran a la primera subcuenta sin pagar.
  select c.id into v_check_id
    from public.order_checks c
   where c.order_id = v_order_id and c.paid_at is null
   order by c.seq
   limit 1;

  if v_check_id is null then
    return jsonb_build_object('ok', false, 'code', 'ALL_CHECKS_PAID');
  end if;

  -- Se resuelve el precio contra el catálogo SIN filtrar por is_active: si el admin
  -- desactivó un plato mientras el mesero estaba sin señal, la comida ya se sirvió y
  -- no se puede rechazar un pedido físico por un cambio de carta.
  insert into public.order_items (
    id, order_id, check_id, menu_item_id, variant_id, qty,
    unit_price, item_name, variant_name, note, client_created_at, created_by
  )
  select
    (e->>'id')::uuid,
    v_order_id,
    v_check_id,
    mi.id,
    mv.id,
    greatest(coalesce((e->>'qty')::int, 1), 1),
    coalesce(mv.price, mi.base_price),
    mi.name,
    mv.name,
    nullif(e->>'note', ''),
    coalesce(nullif(e->>'client_created_at', '')::timestamptz, v_client_at),
    v_uid
  from jsonb_array_elements(coalesce(p_order->'items', '[]'::jsonb)) as e
  join public.menu_items mi on mi.id = nullif(e->>'menu_item_id', '')::uuid
  left join public.menu_item_variants mv
         on mv.id = nullif(e->>'variant_id', '')::uuid
        and mv.menu_item_id = mi.id
  on conflict (id) do nothing;

  select * into v_order from public.orders where id = v_order_id;

  return jsonb_build_object(
    'ok', true, 'code', null,
    'order', to_jsonb(v_order),
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.client_created_at, i.created_at)
        from public.order_items i where i.order_id = v_order_id
    ), '[]'::jsonb)
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- get_order_ticket · payload para imprimir la comanda
-- -----------------------------------------------------------------------------
-- Con p_only_unprinted = true devuelve SOLO lo que aún no fue a Cocina, que es el
-- caso de las adiciones. No marca nada como impreso: eso lo hace `mark_order_printed`
-- en una llamada aparte, para que una impresión fallida no pierda el ticket.
create or replace function public.get_order_ticket(p_order_id uuid, p_only_unprinted boolean default true)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
begin
  if not public.is_caja_or_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  return jsonb_build_object(
    'ok', true, 'code', null,
    'restaurant', (select to_jsonb(s) from public.restaurant_settings s where s.id),
    'order', to_jsonb(v_order),
    'dining_room', (select r.name from public.dining_rooms r where r.id = v_order.dining_room_id),
    'waiter', (select p.full_name from public.profiles p where p.id = v_order.waiter_id),
    'is_addition', p_only_unprinted and v_order.printed_at is not null,
    'printed_now_at', now(),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'qty', i.qty, 'item_name', i.item_name,
               'variant_name', i.variant_name, 'note', i.note
             ) order by i.client_created_at, i.created_at)
        from public.order_items i
       where i.order_id = p_order_id
         and i.voided_at is null
         and (not p_only_unprinted or i.printed_at is null)
    ), '[]'::jsonb)
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- mark_order_printed · sella lo que acaba de salir por la impresora
-- -----------------------------------------------------------------------------
create or replace function public.mark_order_printed(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not public.is_caja_or_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  update public.order_items
     set printed_at = now()
   where order_id = p_order_id and printed_at is null and voided_at is null;
  get diagnostics v_count = row_count;

  update public.orders
     set printed_at = coalesce(printed_at, now()),
         status = case when status = 'pendiente' then 'impreso' else status end
   where id = p_order_id and status not in ('cerrado', 'anulado');

  return jsonb_build_object('ok', true, 'code', null, 'printed_items', v_count);
end;
$$;


-- -----------------------------------------------------------------------------
-- void_order_item · anular una línea que YA fue a Cocina
-- -----------------------------------------------------------------------------
-- Las líneas sin imprimir el mesero las borra directo (política DELETE en 06_rls.sql).
-- Una vez impresa, la comida se preparó: solo Caja la anula y queda el registro.
create or replace function public.void_order_item(p_item_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.order_items;
begin
  if not public.is_caja_or_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select * into v_item from public.order_items where id = p_item_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_item.voided_at is not null then
    return jsonb_build_object('ok', true, 'code', null, 'item', to_jsonb(v_item));  -- idempotente
  end if;

  update public.order_items
     set voided_at = now(), voided_by = auth.uid(), void_reason = nullif(p_reason, '')
   where id = p_item_id
  returning * into v_item;

  return jsonb_build_object('ok', true, 'code', null, 'item', to_jsonb(v_item));
end;
$$;


-- -----------------------------------------------------------------------------
-- split_order_line · partir una línea por cantidad
-- -----------------------------------------------------------------------------
-- Para cuando dos personas comparten un plato y quieren pagarlo por separado: una
-- línea de qty 2 se convierte en dos de qty 1, que luego van a subcuentas distintas.
-- Un plato siempre pertenece a UNA sola subcuenta.
create or replace function public.split_order_line(
  p_item_id     uuid,
  p_qty         int,
  p_new_item_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.order_items;
begin
  if not public.is_caja_or_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select * into v_item from public.order_items where id = p_item_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p_qty < 1 or p_qty >= v_item.qty then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'detail', 'cantidad inválida');
  end if;

  update public.order_items set qty = qty - p_qty where id = p_item_id;

  -- La copia hereda printed_at: si el original ya fue a Cocina, la mitad también.
  insert into public.order_items (
    id, order_id, check_id, menu_item_id, variant_id, qty, unit_price,
    item_name, variant_name, note, client_created_at, created_by, printed_at
  )
  values (
    p_new_item_id, v_item.order_id, v_item.check_id, v_item.menu_item_id, v_item.variant_id,
    p_qty, v_item.unit_price, v_item.item_name, v_item.variant_name, v_item.note,
    v_item.client_created_at, auth.uid(), v_item.printed_at
  );

  return jsonb_build_object('ok', true, 'code', null,
                            'original_id', p_item_id, 'new_id', p_new_item_id);
end;
$$;


-- -----------------------------------------------------------------------------
-- split_order · dividir la cuenta por platos
-- -----------------------------------------------------------------------------
-- p_assignments = [{ "seq": 1, "item_ids": [...] }, { "seq": 2, "item_ids": [...] }]
--
-- Lo hace CAJA al momento de cobrar: el mesero siempre toma el pedido completo. Las
-- líneas que no se mencionen se quedan donde están. Al final se eliminan las
-- subcuentas que quedaron vacías (salvo la seq 1, que siempre existe).
create or replace function public.split_order(p_order_id uuid, p_assignments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_a     jsonb;
  v_seq   int;
  v_check uuid;
begin
  if not public.is_caja_or_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_order.status in ('cerrado', 'anulado') then
    return jsonb_build_object('ok', false, 'code', 'ORDER_CLOSED');
  end if;

  for v_a in select * from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb))
  loop
    v_seq := (v_a->>'seq')::int;

    insert into public.order_checks (order_id, seq) values (p_order_id, v_seq)
      on conflict (order_id, seq) do nothing;

    select c.id into v_check
      from public.order_checks c where c.order_id = p_order_id and c.seq = v_seq;

    -- Si la subcuenta destino ya está pagada, el trigger tg_lock_settled_items
    -- rechaza el movimiento; esta comprobación da un error legible antes.
    if exists (select 1 from public.order_checks c
                where c.id = v_check and c.paid_at is not null) then
      return jsonb_build_object('ok', false, 'code', 'CHECK_PAID', 'check_id', v_check);
    end if;

    update public.order_items i
       set check_id = v_check
     where i.order_id = p_order_id
       and i.id in (select (x)::uuid
                      from jsonb_array_elements_text(coalesce(v_a->'item_ids', '[]'::jsonb)) as x)
       and i.check_id <> v_check;
  end loop;

  -- Limpieza: subcuentas sin líneas y sin pagar (excepto la principal).
  delete from public.order_checks c
   where c.order_id = p_order_id
     and c.seq > 1
     and c.paid_at is null
     and not exists (select 1 from public.order_items i where i.check_id = c.id);

  return jsonb_build_object(
    'ok', true, 'code', null,
    'checks', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.seq)
        from public.order_checks c where c.order_id = p_order_id
    ), '[]'::jsonb)
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- close_check · cobrar una subcuenta
-- -----------------------------------------------------------------------------
-- p_payments = [{ "method": "efectivo", "amount": 30000, "tendered": 50000 },
--               { "method": "transferencia", "amount": 20000, "reference": "..." }]
--
-- Un pago mixto son simplemente dos elementos del arreglo. Cuando la ÚLTIMA subcuenta
-- queda pagada, el pedido se cierra y la mesa se libera sola: no hay ningún flag que
-- actualizar, porque `orders_one_open_per_table_key` deja de aplicar.
create or replace function public.close_check(p_check_id uuid, p_payments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_check     public.order_checks;
  v_order     public.orders;
  v_sum       numeric(12, 2);
  v_remaining int;
begin
  if not public.is_caja_or_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select * into v_check from public.order_checks where id = p_check_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_check.paid_at is not null then
    return jsonb_build_object('ok', false, 'code', 'CHECK_PAID');
  end if;

  select * into v_order from public.orders where id = v_check.order_id for update;
  if v_order.status in ('cerrado', 'anulado') then
    return jsonb_build_object('ok', false, 'code', 'ORDER_CLOSED');
  end if;

  select coalesce(sum((e->>'amount')::numeric), 0)
    into v_sum
    from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) as e;

  if v_sum <> v_check.total then
    return jsonb_build_object('ok', false, 'code', 'AMOUNT_MISMATCH',
                              'expected', v_check.total, 'received', v_sum);
  end if;

  insert into public.payments (order_id, check_id, method, amount, tendered, reference, created_by)
  select
    v_check.order_id,
    p_check_id,
    (e->>'method')::public.payment_method,
    (e->>'amount')::numeric,
    nullif(e->>'tendered', '')::numeric,
    nullif(e->>'reference', ''),
    v_uid
  from jsonb_array_elements(p_payments) as e
  on conflict (check_id, method) do nothing;

  update public.order_checks
     set paid_at = now(), paid_by = v_uid
   where id = p_check_id;

  select count(*) into v_remaining
    from public.order_checks c
   where c.order_id = v_check.order_id and c.paid_at is null;

  if v_remaining = 0 then
    update public.orders
       set status = 'cerrado', closed_at = now(), closed_by = v_uid
     where id = v_check.order_id;

    -- La mesa vuelve a la bolsa común para que cualquier mesero la tome.
    update public.tables set assigned_waiter_id = null where id = v_order.table_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'code', null,
    'order_closed', v_remaining = 0,
    'checks_remaining', v_remaining,
    'check', (select to_jsonb(c) from public.order_checks c where c.id = p_check_id)
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- get_receipt · recibo de una subcuenta (imprimible bajo demanda)
-- -----------------------------------------------------------------------------
create or replace function public.get_receipt(p_check_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_check public.order_checks;
  v_order public.orders;
begin
  if not public.is_caja_or_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select * into v_check from public.order_checks where id = p_check_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into v_order from public.orders where id = v_check.order_id;

  return jsonb_build_object(
    'ok', true, 'code', null,
    'restaurant', (select to_jsonb(s) from public.restaurant_settings s where s.id),
    'order', to_jsonb(v_order),
    'check', to_jsonb(v_check),
    'dining_room', (select r.name from public.dining_rooms r where r.id = v_order.dining_room_id),
    'waiter', (select p.full_name from public.profiles p where p.id = v_order.waiter_id),
    -- Cuántas subcuentas tiene el pedido: si es más de una, el recibo debe decir
    -- "Cuenta 2 de 3" para que el cliente entienda que no es el total de la mesa.
    'checks_total', (select count(*) from public.order_checks c where c.order_id = v_order.id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'qty', i.qty, 'item_name', i.item_name, 'variant_name', i.variant_name,
               'unit_price', i.unit_price, 'line_total', i.line_total
             ) order by i.client_created_at, i.created_at)
        from public.order_items i
       where i.check_id = p_check_id and i.voided_at is null
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'method', pm.method, 'amount', pm.amount,
               'tendered', pm.tendered, 'reference', pm.reference,
               'change', case when pm.tendered is not null then pm.tendered - pm.amount end
             ) order by pm.created_at)
        from public.payments pm where pm.check_id = p_check_id
    ), '[]'::jsonb)
  );
end;
$$;


-- =============================================================================
-- Permisos de ejecución
-- =============================================================================
-- Todas son SECURITY DEFINER: se saltan RLS por diseño, así que cada una verifica el
-- rol internamente. Se revoca a `public` y `anon` para que solo un usuario autenticado
-- pueda siquiera invocarlas.
do $$
declare
  v_fn text;
begin
  foreach v_fn in array array[
    'public.claim_table(uuid)',
    'public.get_menu_snapshot()',
    'public.submit_order(jsonb)',
    'public.get_order_ticket(uuid, boolean)',
    'public.mark_order_printed(uuid)',
    'public.void_order_item(uuid, text)',
    'public.split_order_line(uuid, int, uuid)',
    'public.split_order(uuid, jsonb)',
    'public.close_check(uuid, jsonb)',
    'public.get_receipt(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;
