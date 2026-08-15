-- =============================================================================
-- 08 · split_order también valida la cuenta de ORIGEN
-- =============================================================================
-- La versión anterior solo comprobaba que la subcuenta DESTINO no estuviera pagada.
-- Mover una línea DESDE una cuenta ya pagada quedaba frenado igual —el trigger
-- `tg_lock_settled_items` lo impide— pero como excepción de Postgres, no como resultado
-- de negocio. Al cajero le llegaba un mensaje crudo en inglés en vez de una explicación.
--
-- La integridad nunca estuvo en riesgo; lo que se arregla es el contrato: todos los
-- casos esperados de este proyecto devuelven `{ ok:false, code }`, no lanzan.
-- =============================================================================

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
  v_ids   uuid[];
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

    select array_agg((x)::uuid)
      into v_ids
      from jsonb_array_elements_text(coalesce(v_a->'item_ids', '[]'::jsonb)) as x;

    v_ids := coalesce(v_ids, '{}');

    insert into public.order_checks (order_id, seq) values (p_order_id, v_seq)
      on conflict (order_id, seq) do nothing;

    select c.id into v_check
      from public.order_checks c where c.order_id = p_order_id and c.seq = v_seq;

    -- Destino pagado: no se le pueden agregar platos.
    if exists (select 1 from public.order_checks c
                where c.id = v_check and c.paid_at is not null) then
      return jsonb_build_object('ok', false, 'code', 'CHECK_PAID', 'check_id', v_check);
    end if;

    -- Origen pagado: tampoco se le pueden quitar. Ese dinero ya se cobró contra esas
    -- líneas exactas, y moverlas cambiaría un recibo ya entregado.
    if exists (
      select 1
        from public.order_items i
        join public.order_checks c on c.id = i.check_id
       where i.order_id = p_order_id
         and i.id = any(v_ids)
         and i.check_id <> v_check
         and c.paid_at is not null
    ) then
      return jsonb_build_object('ok', false, 'code', 'CHECK_PAID', 'detail', 'origen pagado');
    end if;

    update public.order_items i
       set check_id = v_check
     where i.order_id = p_order_id
       and i.id = any(v_ids)
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

revoke all on function public.split_order(uuid, jsonb) from public, anon;
grant execute on function public.split_order(uuid, jsonb) to authenticated;
