-- =============================================================================
-- Prueba de humo del esquema · flujo completo + negativos de RLS
-- =============================================================================
-- Verifica lo que CLAUDE.md exige y que no se puede comprobar leyendo el SQL:
-- idempotencia del envío offline, adiciones que solo imprimen lo nuevo, división de
-- cuentas, pago mixto, liberación automática de la mesa, y los límites de cada rol.
--
-- Se corre contra una base RECIÉN migrada y sembrada:
--     psql "$SUPABASE_DB_URL" -f supabase/tests/flujo_completo.sql
--
-- Importante: se ejecuta como `authenticated` suplantando el claim `sub` del JWT,
-- NO con service_role — probar RLS con service_role no prueba nada, porque la ignora.
-- =============================================================================

\pset pager off
\set ON_ERROR_STOP off

\set mesero '33333333-3333-4333-8333-333333333333'
\set caja   '22222222-2222-4222-8222-222222222222'
\set admin  '11111111-1111-4111-8111-111111111111'
\set order1 'dddddddd-0000-4000-8000-000000000001'
\set item1  'eeeeeeee-0000-4000-8000-000000000001'
\set item2  'eeeeeeee-0000-4000-8000-000000000002'
\set item3  'eeeeeeee-0000-4000-8000-000000000003'

-- Limpieza previa, para que la prueba se pueda correr varias veces seguidas sin
-- necesidad de `supabase db reset`. Usa ids fijos a propósito (son los mismos que
-- generaría el celular del mesero), así que hay que borrar los de la corrida anterior.
--
-- `session_replication_role = replica` desactiva los triggers de usuario: sin eso,
-- `tg_lock_settled_items` impediría borrar las líneas de un pedido ya cerrado — que es
-- justo la protección que la prueba verifica más abajo.
--
-- Ojo: ese modo también desactiva las FK, así que el ON DELETE CASCADE NO corre y hay
-- que borrar los hijos a mano, de adentro hacia afuera. Borrar solo `orders` dejaría
-- líneas y subcuentas huérfanas, y la siguiente corrida daría totales absurdos.
set session_replication_role = replica;
delete from public.payments     where order_id in ('dddddddd-0000-4000-8000-000000000001',
                                                   'dddddddd-0000-4000-8000-000000000002');
delete from public.order_items  where order_id in ('dddddddd-0000-4000-8000-000000000001',
                                                   'dddddddd-0000-4000-8000-000000000002');
delete from public.order_checks where order_id in ('dddddddd-0000-4000-8000-000000000001',
                                                   'dddddddd-0000-4000-8000-000000000002');
delete from public.orders       where id       in ('dddddddd-0000-4000-8000-000000000001',
                                                   'dddddddd-0000-4000-8000-000000000002');
update public.tables set assigned_waiter_id = null where label in ('1', '2');
set session_replication_role = default;

select set_config('request.jwt.claim.sub', :'mesero', false);
set role authenticated;

\echo '=== 1. El mesero toma una mesa libre  (esperado: true)'
select public.claim_table((select id from public.tables where label = '1'))->>'ok' as ok;

\echo '=== 2. Otro usuario intenta tomar la misma mesa  (esperado: TABLE_TAKEN)'
select set_config('request.jwt.claim.sub', :'caja', false);
select public.claim_table((select id from public.tables where label = '1'))->>'code' as code;
select set_config('request.jwt.claim.sub', :'mesero', false);

\echo '=== 3. Envía el pedido: 2 bandejas + 1 sancocho media porción  (esperado: 2 líneas / 96000)'
select public.submit_order(jsonb_build_object(
  'id', :'order1',
  'table_id', (select id from public.tables where label = '1'),
  'client_created_at', now(),
  'items', jsonb_build_array(
    jsonb_build_object('id', :'item1', 'menu_item_id', 'cccccccc-0000-4000-8000-000000000002',
                       'qty', 2, 'client_created_at', now()),
    jsonb_build_object('id', :'item2', 'menu_item_id', 'cccccccc-0000-4000-8000-000000000003',
                       'variant_id', (select id from public.menu_item_variants
                                       where menu_item_id = 'cccccccc-0000-4000-8000-000000000003'
                                         and name = 'Media porción'),
                       'qty', 1, 'client_created_at', now())
  )
))->>'ok' as ok;
select count(*) as lineas, max(o.total) as total
  from public.order_items i join public.orders o on o.id = i.order_id
 where i.order_id = :'order1';

\echo '=== 4. IDEMPOTENCIA: se reenvía el mismo pedido dos veces  (esperado: SIGUE en 2 líneas / 96000)'
select public.submit_order(jsonb_build_object(
  'id', :'order1', 'table_id', (select id from public.tables where label = '1'),
  'client_created_at', now(),
  'items', jsonb_build_array(
    jsonb_build_object('id', :'item1', 'menu_item_id', 'cccccccc-0000-4000-8000-000000000002', 'qty', 2, 'client_created_at', now()),
    jsonb_build_object('id', :'item2', 'menu_item_id', 'cccccccc-0000-4000-8000-000000000003', 'qty', 1, 'client_created_at', now()))
))->>'ok' as reintento_1;
select public.submit_order(jsonb_build_object(
  'id', :'order1', 'table_id', (select id from public.tables where label = '1'),
  'client_created_at', now(),
  'items', jsonb_build_array(
    jsonb_build_object('id', :'item1', 'menu_item_id', 'cccccccc-0000-4000-8000-000000000002', 'qty', 2, 'client_created_at', now()))
))->>'ok' as reintento_2;
select count(*) as lineas, max(o.total) as total
  from public.order_items i join public.orders o on o.id = i.order_id
 where i.order_id = :'order1';

\echo '=== 5. Caja imprime la comanda  (esperado: 2 líneas impresas)'
select set_config('request.jwt.claim.sub', :'caja', false);
select public.mark_order_printed(:'order1')->>'printed_items' as impresas;

\echo '=== 6. Adición: la mesa pide 2 gaseosas'
select set_config('request.jwt.claim.sub', :'mesero', false);
select public.submit_order(jsonb_build_object(
  'id', :'order1', 'table_id', (select id from public.tables where label = '1'),
  'client_created_at', now(),
  'items', jsonb_build_array(
    jsonb_build_object('id', :'item3', 'menu_item_id', 'cccccccc-0000-4000-8000-000000000006',
                       'qty', 2, 'client_created_at', now()))
))->>'ok' as ok;

\echo '=== 7. El ticket de adición trae SOLO lo nuevo  (esperado: 1 línea, Gaseosa)'
select set_config('request.jwt.claim.sub', :'caja', false);
select jsonb_array_length(public.get_order_ticket(:'order1', true)->'items') as lineas,
       public.get_order_ticket(:'order1', true)->'items'->0->>'item_name' as cual;

\echo '=== 8. División de cuenta por platos  (esperado: seq1=76000, seq2=30000)'
select public.split_order(:'order1', jsonb_build_array(
  jsonb_build_object('seq', 1, 'item_ids', jsonb_build_array(:'item1')),
  jsonb_build_object('seq', 2, 'item_ids', jsonb_build_array(:'item2', :'item3'))
))->>'ok' as ok;
select seq, total from public.order_checks where order_id = :'order1' order by seq;

\echo '=== 9. Pago que no cuadra  (esperado: AMOUNT_MISMATCH)'
select public.close_check(
  (select id from public.order_checks where order_id = :'order1' and seq = 1),
  jsonb_build_array(jsonb_build_object('method', 'efectivo', 'amount', 50000))
)->>'code' as code;

\echo '=== 10. Cuenta 1 con pago MIXTO  (esperado: ok, order_closed=false)'
select public.close_check(
  (select id from public.order_checks where order_id = :'order1' and seq = 1),
  jsonb_build_array(
    jsonb_build_object('method', 'efectivo', 'amount', 40000, 'tendered', 50000),
    jsonb_build_object('method', 'transferencia', 'amount', 36000, 'reference', 'NEQ-123'))
)->>'order_closed' as order_closed;

\echo '=== 11. La mesa sigue ocupada porque falta una cuenta  (esperado: t)'
select is_occupied, checks_count from public.v_table_map where table_label = '1';

\echo '=== 12. Se paga la cuenta 2 -> cierra el pedido y libera la mesa  (esperado: true, luego f)'
select public.close_check(
  (select id from public.order_checks where order_id = :'order1' and seq = 2),
  jsonb_build_array(jsonb_build_object('method', 'efectivo', 'amount', 30000))
)->>'order_closed' as order_closed;
select is_occupied, assigned_waiter_name from public.v_table_map where table_label = '1';

\echo '=== 13. Ventas de la jornada  (esperado: 106000 = 70000 efectivo + 36000 transferencia)'
select * from public.v_sales_daily;

\echo '=== 14. Pedido tardío del outbox sobre una mesa ya cerrada  (esperado: ORDER_CLOSED)'
select set_config('request.jwt.claim.sub', :'mesero', false);
select public.submit_order(jsonb_build_object(
  'id', :'order1', 'table_id', (select id from public.tables where label = '1'),
  'client_created_at', now(),
  'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(),
      'menu_item_id', 'cccccccc-0000-4000-8000-000000000006', 'qty', 1, 'client_created_at', now()))
))->>'code' as code;

\echo '=== 15. RLS: el mesero no ve pagos, Caja sí  (esperado: 0 y 3)'
select count(*) as pagos_para_mesero from public.payments;
select set_config('request.jwt.claim.sub', :'caja', false);
select count(*) as pagos_para_caja from public.payments;


-- ---------------------------------------------------------------------------
-- Negativos de RLS
-- ---------------------------------------------------------------------------
\set order2 'dddddddd-0000-4000-8000-000000000002'
\set itemA  'eeeeeeee-0000-4000-8000-00000000000a'

select set_config('request.jwt.claim.sub', :'mesero', false);
select public.claim_table((select id from public.tables where label = '2'))->>'ok' as toma_mesa_2;
select public.submit_order(jsonb_build_object(
  'id', :'order2', 'table_id', (select id from public.tables where label = '2'),
  'client_created_at', now(),
  'items', jsonb_build_array(jsonb_build_object('id', :'itemA',
      'menu_item_id', 'cccccccc-0000-4000-8000-000000000002', 'qty', 1, 'client_created_at', now()))
))->>'ok' as ok;

\echo '=== 16. El mesero borra una línea NO impresa  (esperado: DELETE 1)'
delete from public.order_items where id = :'itemA';

\echo '=== 17. Se re-agrega, Caja imprime, el mesero intenta borrarla  (esperado: DELETE 0)'
select public.submit_order(jsonb_build_object(
  'id', :'order2', 'table_id', (select id from public.tables where label = '2'),
  'client_created_at', now(),
  'items', jsonb_build_array(jsonb_build_object('id', :'itemA',
      'menu_item_id', 'cccccccc-0000-4000-8000-000000000002', 'qty', 1, 'client_created_at', now()))
))->>'ok' as ok;
select set_config('request.jwt.claim.sub', :'caja', false);
select public.mark_order_printed(:'order2')->>'printed_items' as impresas;
select set_config('request.jwt.claim.sub', :'mesero', false);
delete from public.order_items where id = :'itemA';

\echo '=== 18. El mesero intenta escribir el total  (esperado: ERROR permission denied)'
update public.orders set total = 1 where id = :'order2';

\echo '=== 19. El mesero intenta anular una línea impresa  (esperado: FORBIDDEN)'
select public.void_order_item(:'itemA', 'se arrepintió')->>'code' as code;

\echo '=== 20. Un mesero ajeno intenta agregar a una mesa que no tomó  (esperado: FORBIDDEN)'
select set_config('request.jwt.claim.sub', :'admin', false);
reset role;
update public.profiles set role = 'mesero' where id = :'admin';
set role authenticated;
select public.submit_order(jsonb_build_object(
  'id', :'order2', 'table_id', (select id from public.tables where label = '2'),
  'client_created_at', now(),
  'items', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(),
      'menu_item_id', 'cccccccc-0000-4000-8000-000000000006', 'qty', 1, 'client_created_at', now()))
))->>'code' as code;

\echo '=== 21. ...pero SÍ ve la mesa ajena (ve todas, edita solo las suyas)  (esperado: >= 1)'
select count(*) as pedidos_visibles from public.orders where status <> 'cerrado';

\echo '=== 22. ...y tampoco puede tomarla  (esperado: TABLE_TAKEN)'
select public.claim_table((select id from public.tables where label = '2'))->>'code' as code;

reset role;
update public.profiles set role = 'admin' where id = :'admin';
