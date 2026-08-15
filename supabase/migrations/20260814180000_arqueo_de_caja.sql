-- =============================================================================
-- 09 · Arqueo de caja y notas por línea
-- =============================================================================
-- Un arqueo es un HECHO HISTÓRICO: lo que el cajero contó y contra qué cifra lo comparó
-- EN ESE MOMENTO. Por eso `expected_cash` se CONGELA como columna y jamás se recalcula.
--
-- Si se derivara al leer, anular una línea impresa hoy cambiaría retroactivamente el
-- descuadre de un arqueo firmado hace tres semanas: un cuadre perfecto se convertiría
-- solo en un faltante de $12.000 y nadie sabría por qué. Es la misma idea que ya usan
-- `order_items.unit_price` e `item_name` — se deriva lo actual, se congela lo histórico.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- cash_sessions · la caja de una jornada
-- -----------------------------------------------------------------------------
create table public.cash_sessions (
  id            uuid primary key default gen_random_uuid(),
  seq           int not null check (seq > 0),
  opened_at     timestamptz not null default now(),
  business_date date generated always as (public.to_business_date(opened_at)) stored,

  opened_by     uuid not null references public.profiles (id) on delete restrict,
  -- Fondo para dar vueltos. El conteo del cierre lo INCLUYE: se cuenta lo que hay en el
  -- cajón, no solo la venta (CLAUDE.md).
  opening_float numeric(12, 2) not null default 0 check (opening_float >= 0),

  closed_at     timestamptz,
  closed_by     uuid references public.profiles (id) on delete restrict,

  -- Congelados al cerrar. NUNCA se recalculan.
  expected_cash      numeric(12, 2),
  counted_cash       numeric(12, 2) check (counted_cash is null or counted_cash >= 0),
  expected_transfers numeric(12, 2),
  -- null = no se verificó contra el banco (no había señal, o no se quiso).
  counted_transfers  numeric(12, 2) check (counted_transfers is null or counted_transfers >= 0),

  cash_difference     numeric(12, 2) generated always as (counted_cash - expected_cash) stored,
  transfer_difference numeric(12, 2) generated always as (counted_transfers - expected_transfers) stored,

  notes text,

  -- Corrección posterior: solo admin, una sola vez, con motivo. `expected_cash` no se toca.
  amended_at   timestamptz,
  amended_by   uuid references public.profiles (id) on delete restrict,
  amended_from numeric(12, 2),
  amend_reason text,

  constraint cash_sessions_closed_complete check (
       (closed_at is null and closed_by is null and counted_cash is null and expected_cash is null)
    or (closed_at is not null and closed_by is not null and counted_cash is not null
        and expected_cash is not null)
  ),
  constraint cash_sessions_closed_after_open check (closed_at is null or closed_at >= opened_at),
  constraint cash_sessions_amend_complete check (
       (amended_at is null and amended_by is null and amended_from is null and amend_reason is null)
    or (amended_at is not null and amended_by is not null and amended_from is not null
        and amend_reason is not null and closed_at is not null)
  ),
  constraint cash_sessions_seq_key unique (business_date, seq)
);

-- Una sola caja abierta en todo el restaurante: hay un solo cajón físico. Mismo truco
-- que `orders_one_open_per_table_key` — la unicidad es un índice parcial, no un booleano
-- que se puede desincronizar. Tampoco hay columna `status`: "abierta" es closed_at null.
create unique index cash_sessions_one_open_key
  on public.cash_sessions ((closed_at is null))
  where closed_at is null;


-- -----------------------------------------------------------------------------
-- cash_movements · lo que entra y sale del cajón sin ser una venta
-- -----------------------------------------------------------------------------
-- CLAUDE.md: sí se saca plata del cajón durante la jornada (pagarle al de las gaseosas,
-- mandar por hielo). Es lo que más descuadra arqueos en la vida real, y sin registrarlo
-- el faltante aparece al final sin explicación.
create type public.cash_movement_kind as enum ('retiro', 'ingreso');

create table public.cash_movements (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cash_sessions (id) on delete restrict,
  kind       public.cash_movement_kind not null,
  amount     numeric(12, 2) not null check (amount > 0),
  reason     text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id) on delete restrict
);

create index cash_movements_session_idx on public.cash_movements (session_id);


-- -----------------------------------------------------------------------------
-- El pago sabe a qué arqueo pertenece
-- -----------------------------------------------------------------------------
-- Se estampa en vez de deducirlo por ventana de tiempo. Un pago cobrado sin arqueo
-- abierto queda en `null` — un huérfano EXPLÍCITO y consultable, en vez de un dato
-- ambiguo que hay que interpretar comparando timestamps un año después.
alter table public.payments
  add column cash_session_id uuid references public.cash_sessions (id) on delete restrict;

create index payments_cash_session_idx on public.payments (cash_session_id);
grant select (cash_session_id) on public.payments to authenticated;


-- -----------------------------------------------------------------------------
-- Notas por línea: defensa mínima en la base
-- -----------------------------------------------------------------------------
-- La columna, el payload de `submit_order` y la política de UPDATE ya existían; esto
-- solo evita dos problemas concretos:
--   · Un <textarea> vacío manda '' y no NULL. Sin esto, "¿tiene nota?" tiene dos
--     respuestas distintas y la comanda imprime un renglón destacado en blanco.
--   · Sin tope, un pulgar apoyado en la pantalla empuja media comanda fuera de la hoja.
-- El maxLength del input es la experiencia de uso; esto es la garantía.
alter table public.order_items
  add constraint order_items_note_len
  check (note is null or (btrim(note) <> '' and length(note) <= 120));


-- =============================================================================
-- RPC
-- =============================================================================

create or replace function public.open_cash_session(p_opening_float numeric default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_open   public.cash_sessions;
  v_seq    int;
  v_id     uuid;
begin
  if not public.is_caja_or_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_opening_float is null or p_opening_float < 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT');
  end if;

  select * into v_open from public.cash_sessions where closed_at is null limit 1;
  if found then
    -- Caso real: se olvidaron de cerrar el domingo pasado. La UI necesita la fecha para
    -- poder decir "hay un arqueo abierto del 3 de agosto" en vez de un error genérico.
    return jsonb_build_object('ok', false, 'code', 'SESSION_ALREADY_OPEN',
                              'session_id', v_open.id,
                              'business_date', v_open.business_date,
                              'opened_at', v_open.opened_at);
  end if;

  select coalesce(max(seq), 0) + 1 into v_seq
    from public.cash_sessions
   where business_date = public.to_business_date(now());

  insert into public.cash_sessions (seq, opened_by, opening_float)
  values (v_seq, auth.uid(), p_opening_float)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'code', null, 'session_id', v_id, 'seq', v_seq);
end;
$$;


create or replace function public.add_cash_movement(
  p_kind   public.cash_movement_kind,
  p_amount numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
begin
  if not public.is_caja_or_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT');
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;

  select * into v_session from public.cash_sessions where closed_at is null limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_OPEN_SESSION');
  end if;

  insert into public.cash_movements (session_id, kind, amount, reason, created_by)
  values (v_session.id, p_kind, p_amount, btrim(p_reason), auth.uid());

  return jsonb_build_object('ok', true, 'code', null);
end;
$$;


/*
 * Cierra el arqueo.
 *
 * Se puede cerrar con descuadre siempre (CLAUDE.md): negarlo no elimina la diferencia,
 * obliga al cajero a mentir sobre el conteo hasta que cuadre. Lo que sí se exige es la
 * explicación cuando hay diferencia.
 */
create or replace function public.close_cash_session(
  p_session_id        uuid,
  p_counted_cash      numeric,
  p_counted_transfers numeric default null,
  p_notes             text    default null,
  p_allow_open_orders boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session   public.cash_sessions;
  v_cash      numeric(12, 2);
  v_transfers numeric(12, 2);
  v_in        numeric(12, 2);
  v_out       numeric(12, 2);
  v_expected  numeric(12, 2);
  v_open      int;
begin
  if not public.is_caja_or_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT');
  end if;

  -- `for update` serializa dos cierres simultáneos desde dos pestañas.
  select * into v_session from public.cash_sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_session.closed_at is not null then
    return jsonb_build_object('ok', false, 'code', 'SESSION_CLOSED');
  end if;

  -- Cobrar nunca se bloquea por el arqueo, pero cerrar con mesas sin cobrar sí avisa:
  -- así se evita por construcción la mayoría de los pagos huérfanos.
  select count(*) into v_open
    from public.orders where status in ('pendiente', 'impreso', 'en_mesa');

  if v_open > 0 and not p_allow_open_orders then
    return jsonb_build_object('ok', false, 'code', 'OPEN_ORDERS', 'open_orders', v_open);
  end if;

  -- Se suma `amount`, NUNCA `tendered`: tendered es lo que el cliente entregó antes del
  -- vuelto; al cajón solo entra `amount`. Sumar tendered inflaría el esperado por todo
  -- el vuelto devuelto.
  select coalesce(sum(amount) filter (where method = 'efectivo'), 0),
         coalesce(sum(amount) filter (where method = 'transferencia'), 0)
    into v_cash, v_transfers
    from public.payments where cash_session_id = p_session_id;

  select coalesce(sum(amount) filter (where kind = 'ingreso'), 0),
         coalesce(sum(amount) filter (where kind = 'retiro'), 0)
    into v_in, v_out
    from public.cash_movements where session_id = p_session_id;

  v_expected := v_session.opening_float + v_cash + v_in - v_out;

  if p_counted_cash <> v_expected and (p_notes is null or btrim(p_notes) = '') then
    return jsonb_build_object('ok', false, 'code', 'NOTE_REQUIRED',
                              'expected_cash', v_expected,
                              'cash_difference', p_counted_cash - v_expected);
  end if;

  update public.cash_sessions
     set closed_at = now(),
         closed_by = auth.uid(),
         expected_cash = v_expected,
         counted_cash = p_counted_cash,
         expected_transfers = v_transfers,
         counted_transfers = p_counted_transfers,
         notes = nullif(btrim(coalesce(p_notes, '')), '')
   where id = p_session_id;

  return jsonb_build_object(
    'ok', true, 'code', null,
    'expected_cash', v_expected,
    'counted_cash', p_counted_cash,
    'cash_difference', p_counted_cash - v_expected,
    'expected_transfers', v_transfers,
    'counted_transfers', p_counted_transfers
  );
end;
$$;


/*
 * Corrige un conteo mal tecleado. Solo admin, una sola vez, con motivo.
 *
 * NO toca `expected_cash`: lo que se corrige es lo que el cajero dijo haber contado, no
 * la cifra contra la que se comparó. Negar la corrección solo llevaría a que arreglen el
 * error en un papel aparte y el sistema quede desactualizado.
 */
create or replace function public.amend_cash_session(
  p_session_id   uuid,
  p_counted_cash numeric,
  p_reason       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT');
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED');
  end if;

  select * into v_session from public.cash_sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_session.closed_at is null then
    return jsonb_build_object('ok', false, 'code', 'SESSION_NOT_CLOSED');
  end if;
  if v_session.amended_at is not null then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_AMENDED');
  end if;

  update public.cash_sessions
     set counted_cash = p_counted_cash,
         amended_at = now(),
         amended_by = auth.uid(),
         amended_from = v_session.counted_cash,
         amend_reason = btrim(p_reason)
   where id = p_session_id;

  return jsonb_build_object('ok', true, 'code', null,
                            'counted_cash', p_counted_cash,
                            'cash_difference', p_counted_cash - v_session.expected_cash);
end;
$$;


/*
 * Todo lo que necesita la pantalla de arqueo, en una llamada.
 *
 * Con `p_session_id` null devuelve la sesión abierta. Mientras está abierta los totales
 * se calculan EN VIVO —el cajero necesita verlos actualizados—; una vez cerrada se leen
 * las columnas congeladas. Se deriva lo actual, se congela lo histórico.
 */
create or replace function public.get_cash_session(p_session_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_session public.cash_sessions;
  v_cash      numeric(12, 2);
  v_transfers numeric(12, 2);
  v_in        numeric(12, 2);
  v_out       numeric(12, 2);
begin
  if not public.is_caja_or_admin() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  if p_session_id is null then
    select * into v_session from public.cash_sessions where closed_at is null limit 1;
  else
    select * into v_session from public.cash_sessions where id = p_session_id;
  end if;

  if not found then
    return jsonb_build_object('ok', true, 'code', null, 'session', null);
  end if;

  select coalesce(sum(amount) filter (where method = 'efectivo'), 0),
         coalesce(sum(amount) filter (where method = 'transferencia'), 0)
    into v_cash, v_transfers
    from public.payments where cash_session_id = v_session.id;

  select coalesce(sum(amount) filter (where kind = 'ingreso'), 0),
         coalesce(sum(amount) filter (where kind = 'retiro'), 0)
    into v_in, v_out
    from public.cash_movements where session_id = v_session.id;

  return jsonb_build_object(
    'ok', true, 'code', null,
    'session', to_jsonb(v_session),
    'opened_by_name', (select p.full_name from public.profiles p where p.id = v_session.opened_by),
    'closed_by_name', (select p.full_name from public.profiles p where p.id = v_session.closed_by),
    'sales_cash', v_cash,
    'sales_transfers', v_transfers,
    'movements_in', v_in,
    'movements_out', v_out,
    -- Solo tiene sentido mientras está abierta; ya cerrada manda `expected_cash`.
    'live_expected_cash', v_session.opening_float + v_cash + v_in - v_out,
    'payments_count', (select count(*) from public.payments where cash_session_id = v_session.id),
    'movements', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at)
        from public.cash_movements m where m.session_id = v_session.id
    ), '[]'::jsonb),
    -- Con su referencia, para poder puntearlas contra la app del banco.
    'transfers', coalesce((
      select jsonb_agg(jsonb_build_object('amount', p.amount, 'reference', p.reference,
                                          'created_at', p.created_at)
                       order by p.created_at)
        from public.payments p
       where p.cash_session_id = v_session.id and p.method = 'transferencia'
    ), '[]'::jsonb),
    -- Cobros que entraron DESPUÉS del cierre. El arqueo no cambia; esto se muestra al
    -- lado como observación del presente.
    'late_cash', coalesce((
      select sum(p.amount) from public.payments p
       where p.cash_session_id is null
         and v_session.closed_at is not null
         and p.created_at > v_session.closed_at
         and p.method = 'efectivo'
         and public.to_business_date(p.created_at) = v_session.business_date
    ), 0)
  );
end;
$$;


-- -----------------------------------------------------------------------------
-- close_check estampa la sesión abierta en cada pago
-- -----------------------------------------------------------------------------
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
  v_session   uuid;
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

  -- Arqueo abierto, si lo hay. NULL = se cobró sin caja abierta: queda como huérfano
  -- explícito. Cobrar NUNCA se bloquea por esto — el cliente está esperando.
  select id into v_session from public.cash_sessions where closed_at is null limit 1;

  insert into public.payments (order_id, check_id, method, amount, tendered, reference,
                               created_by, cash_session_id)
  select
    v_check.order_id,
    p_check_id,
    (e->>'method')::public.payment_method,
    (e->>'amount')::numeric,
    nullif(e->>'tendered', '')::numeric,
    nullif(e->>'reference', ''),
    v_uid,
    v_session
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

    update public.tables set assigned_waiter_id = null where id = v_order.table_id;
  end if;

  return jsonb_build_object(
    'ok', true, 'code', null,
    'order_closed', v_remaining = 0,
    'checks_remaining', v_remaining,
    -- La UI avisa "estás cobrando sin arqueo abierto" en vez de descubrirlo al cerrar.
    'cash_session_id', v_session,
    'check', (select to_jsonb(c) from public.order_checks c where c.id = p_check_id)
  );
end;
$$;


-- =============================================================================
-- Vista para el historial
-- =============================================================================
create view public.v_cash_sessions
with (security_invoker = on) as
select
  s.*,
  o.full_name as opened_by_name,
  c.full_name as closed_by_name,
  a.full_name as amended_by_name
from public.cash_sessions s
left join public.profiles o on o.id = s.opened_by
left join public.profiles c on c.id = s.closed_by
left join public.profiles a on a.id = s.amended_by;


-- =============================================================================
-- RLS y permisos
-- =============================================================================
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;

revoke all on public.cash_sessions, public.cash_movements from anon, authenticated;
grant select on public.cash_sessions, public.cash_movements to authenticated;
grant select on public.v_cash_sessions to authenticated;

-- Solo lectura, y solo para caja y admin: el mesero no ve dinero, igual que en `payments`.
--
-- No hay INSERT/UPDATE/DELETE para NADIE, tampoco para admin — una desviación deliberada
-- de la matriz general. El valor entero de un arqueo es que `expected_cash` sea una foto
-- no manipulable; si existiera un UPDATE directo dejaría de ser evidencia de nada.
-- Corregir se hace con `amend_cash_session`, que deja rastro.
create policy cash_sessions_select on public.cash_sessions
  for select to authenticated using (public.is_caja_or_admin());

create policy cash_movements_select on public.cash_movements
  for select to authenticated using (public.is_caja_or_admin());

do $$
declare v_fn text;
begin
  foreach v_fn in array array[
    'public.open_cash_session(numeric)',
    'public.add_cash_movement(public.cash_movement_kind, numeric, text)',
    'public.close_cash_session(uuid, numeric, numeric, text, boolean)',
    'public.amend_cash_session(uuid, numeric, text)',
    'public.get_cash_session(uuid)'
  ]
  loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end;
$$;
