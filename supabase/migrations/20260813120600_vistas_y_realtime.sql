-- =============================================================================
-- 07 · Vistas de lectura y Realtime
-- =============================================================================
-- TODAS las vistas llevan `security_invoker = on`. Sin eso, una vista corre con los
-- permisos de su dueño y NO filtra nada — es el error de seguridad más común en
-- Supabase. Con security_invoker, la vista hereda la RLS de las tablas base: el admin
-- ve todo, Caja ve todo, y un mesero solo vería lo que le corresponde.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- v_table_map · la única consulta que necesita la pantalla principal de Caja
-- -----------------------------------------------------------------------------
-- Una fila por mesa activa. "Ocupada" no es una columna: es `open_order_id is not null`.
create view public.v_table_map
with (security_invoker = on) as
select
  t.id                     as table_id,
  t.label                  as table_label,
  t.seats,
  t.sort_order,
  t.dining_room_id,
  r.name                   as dining_room_name,
  r.sort_order             as dining_room_sort_order,
  t.assigned_waiter_id,
  w.full_name              as assigned_waiter_name,
  o.id                     as open_order_id,
  o.status                 as open_order_status,
  o.total                  as open_order_total,
  o.opened_at              as open_order_opened_at,
  o.printed_at             as open_order_printed_at,
  (o.id is not null)       as is_occupied,
  coalesce(i.items_count, 0)         as items_count,
  coalesce(i.unprinted_count, 0) > 0 as has_unprinted_items,
  coalesce(c.checks_count, 0)        as checks_count
from public.tables t
join public.dining_rooms r on r.id = t.dining_room_id
left join public.profiles w on w.id = t.assigned_waiter_id
left join public.orders o
       on o.table_id = t.id
      and o.status in ('pendiente', 'impreso', 'en_mesa')
left join lateral (
  select count(*) filter (where oi.voided_at is null)                             as items_count,
         count(*) filter (where oi.printed_at is null and oi.voided_at is null)    as unprinted_count
    from public.order_items oi where oi.order_id = o.id
) i on true
left join lateral (
  select count(*) as checks_count from public.order_checks oc where oc.order_id = o.id
) c on true
where t.is_active and r.is_active;


-- -----------------------------------------------------------------------------
-- Vistas de ventas · solo pedidos cerrados
-- -----------------------------------------------------------------------------
-- El restaurante abre solo domingos y festivos: `business_date` agrupa por JORNADA,
-- y los reportes deben listar las jornadas que existen, no un rango de calendario.
create view public.v_sales_daily
with (security_invoker = on) as
select
  o.business_date,
  count(*)                                   as orders_count,
  sum(o.total)                               as gross_total,
  coalesce(sum(pm.cash), 0)                  as cash_total,
  coalesce(sum(pm.transfer), 0)              as transfer_total,
  round(avg(o.total), 2)                     as avg_ticket
from public.orders o
left join lateral (
  select
    sum(p.amount) filter (where p.method = 'efectivo')      as cash,
    sum(p.amount) filter (where p.method = 'transferencia') as transfer
  from public.payments p where p.order_id = o.id
) pm on true
where o.status = 'cerrado'
group by o.business_date;


create view public.v_sales_by_dining_room
with (security_invoker = on) as
select
  o.business_date,
  o.dining_room_id,
  r.name       as dining_room_name,
  count(*)     as orders_count,
  sum(o.total) as total
from public.orders o
join public.dining_rooms r on r.id = o.dining_room_id
where o.status = 'cerrado'
group by o.business_date, o.dining_room_id, r.name;


-- Esta vista es además el insumo exacto de la futura fase de análisis de compras con
-- IA (CLAUDE.md, módulo 7): qué se vendió, cuánto y cuándo. No hizo falta agregar
-- nada al esquema para dejar esa puerta abierta.
create view public.v_sales_by_item
with (security_invoker = on) as
select
  o.business_date,
  i.menu_item_id,
  i.item_name,
  i.variant_name,
  sum(i.qty)        as qty_sold,
  sum(i.line_total) as total
from public.order_items i
join public.orders o on o.id = i.order_id
where o.status = 'cerrado' and i.voided_at is null
group by o.business_date, i.menu_item_id, i.item_name, i.variant_name;


create view public.v_sales_by_waiter
with (security_invoker = on) as
select
  o.business_date,
  o.waiter_id,
  p.full_name,
  count(*)     as orders_count,
  sum(o.total) as total
from public.orders o
left join public.profiles p on p.id = o.waiter_id
where o.status = 'cerrado'
group by o.business_date, o.waiter_id, p.full_name;


grant select on public.v_table_map, public.v_sales_daily, public.v_sales_by_dining_room,
                public.v_sales_by_item, public.v_sales_by_waiter
  to authenticated;


-- -----------------------------------------------------------------------------
-- sales_summary · el dashboard del admin en un solo round-trip
-- -----------------------------------------------------------------------------
create or replace function public.sales_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_caja_or_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  return jsonb_build_object(
    'ok', true, 'code', null,
    'from', p_from, 'to', p_to,
    'totals', (
      select jsonb_build_object(
               'orders_count', coalesce(sum(orders_count), 0),
               'gross_total', coalesce(sum(gross_total), 0),
               'cash_total', coalesce(sum(cash_total), 0),
               'transfer_total', coalesce(sum(transfer_total), 0)
             )
        from public.v_sales_daily where business_date between p_from and p_to
    ),
    'by_day', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.business_date)
        from public.v_sales_daily d where d.business_date between p_from and p_to
    ), '[]'::jsonb),
    'by_dining_room', coalesce((
      select jsonb_agg(jsonb_build_object('dining_room_name', x.dining_room_name,
                                          'orders_count', x.orders_count, 'total', x.total)
                       order by x.total desc)
        from (
          select dining_room_name, sum(orders_count) as orders_count, sum(total) as total
            from public.v_sales_by_dining_room
           where business_date between p_from and p_to
           group by dining_room_name
        ) x
    ), '[]'::jsonb),
    'top_items', coalesce((
      select jsonb_agg(jsonb_build_object('item_name', x.item_name, 'variant_name', x.variant_name,
                                          'qty_sold', x.qty_sold, 'total', x.total)
                       order by x.qty_sold desc)
        from (
          select item_name, variant_name, sum(qty_sold) as qty_sold, sum(total) as total
            from public.v_sales_by_item
           where business_date between p_from and p_to
           group by item_name, variant_name
           order by sum(qty_sold) desc
           limit 20
        ) x
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.sales_summary(date, date) from public, anon;
grant execute on function public.sales_summary(date, date) to authenticated;


-- =============================================================================
-- Realtime
-- =============================================================================
-- Solo `orders`, `order_checks` y `tables`. NO se publica `order_items`: suscribir el
-- detalle de todas las mesas es ruido; Caja recarga el detalle con un fetch cuando
-- abre una mesa.
--
-- Se deja `replica identity` en default (no `full`): el cliente re-consulta la fila al
-- recibir el evento en vez de recibir el row completo en cada cambio. Menos tráfico,
-- que es lo que importa con WiFi intermitente.
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_checks;
alter publication supabase_realtime add table public.tables;
