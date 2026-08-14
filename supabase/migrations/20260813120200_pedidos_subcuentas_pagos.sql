-- =============================================================================
-- 03 · Pedidos, subcuentas, líneas y pagos
-- =============================================================================
-- Este archivo es el corazón del sistema. Tres ideas lo gobiernan:
--
--   1. El id lo genera el CLIENTE (uuid v7 en el celular del mesero) antes de tocar
--      la red. Es lo que hace que reintentar un envío offline sea idempotente:
--      `insert ... on conflict (id) do nothing`. Sin tabla de idempotency keys.
--
--   2. Los pedidos CONGELAN lo que necesitan (salón, mesa, nombre del plato, precio)
--      para que el admin pueda renombrar o desactivar cualquier cosa sin corromper
--      reportes ni recibos ya emitidos.
--
--   3. Un pedido se divide en SUBCUENTAS (`order_checks`). Todo pedido tiene al menos
--      una. Caja puede crear más al cobrar y arrastrar líneas entre ellas cuando los
--      comensales quieren pagar por separado. La mesa se libera cuando TODAS están
--      pagadas.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- orders · un pedido = una mesa ocupada
-- -----------------------------------------------------------------------------
create table public.orders (
  id                uuid primary key,  -- SIN default: lo genera el cliente
  table_id          uuid not null references public.tables (id) on delete restrict,

  -- Snapshots del momento de la venta. Si el admin mueve la mesa 5 del salón "Mango"
  -- al "Frente", los pedidos viejos NO deben migrar de salón en los reportes.
  dining_room_id    uuid not null references public.dining_rooms (id) on delete restrict,
  table_label       text not null,

  waiter_id         uuid null references public.profiles (id) on delete restrict,
  status            public.order_status not null default 'pendiente',
  note              text null,

  -- Suma de los totales de las subcuentas. Lo mantiene un trigger y el cliente NO
  -- puede escribirlo (ver los REVOKE en 05_rls.sql).
  total             numeric(12, 2) not null default 0 check (total >= 0),

  -- Cuándo lo tomó el mesero según SU celular. Puede venir con el reloj desfasado y
  -- puede llegar 40 minutos tarde si estuvo offline: sirve para ordenar la UI, nunca
  -- para reportes.
  client_created_at timestamptz not null,
  -- Cuándo llegó al servidor. Esta es la que manda para contabilidad.
  opened_at         timestamptz not null default now(),
  printed_at        timestamptz null,
  closed_at         timestamptz null,

  created_by        uuid not null references public.profiles (id) on delete restrict,
  closed_by         uuid null references public.profiles (id) on delete restrict,

  -- La jornada cierra a las 5 PM y nunca cruza medianoche, así que la fecha local
  -- de apertura identifica la jornada. Indexada para todos los reportes.
  business_date     date generated always as (public.to_business_date(opened_at)) stored,

  constraint orders_closed_consistency check ((status = 'cerrado') = (closed_at is not null)),
  constraint orders_closed_by_consistency check ((closed_at is null) = (closed_by is null))
);

-- ★ EL constraint central del dominio: una mesa no puede tener dos pedidos abiertos.
-- También es lo que hace que "mesa ocupada" sea un dato derivado y no un flag.
create unique index orders_one_open_per_table_key
  on public.orders (table_id)
  where status in ('pendiente', 'impreso', 'en_mesa');

create index orders_open_idx on public.orders (status) where status <> 'cerrado';
create index orders_waiter_idx on public.orders (waiter_id, opened_at desc);
create index orders_business_date_idx on public.orders (business_date, dining_room_id);
create index orders_room_idx on public.orders (dining_room_id, opened_at desc);


-- -----------------------------------------------------------------------------
-- order_checks · subcuentas (división de cuenta)
-- -----------------------------------------------------------------------------
-- Todo pedido nace con la subcuenta seq = 1, creada por `submit_order`. Si nadie
-- pide dividir, esa única subcuenta es la cuenta completa y el usuario nunca ve el
-- concepto. Cuando piden pagar por separado, Caja crea seq 2, 3... y mueve líneas.
create table public.order_checks (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  seq        int not null check (seq > 0),
  total      numeric(12, 2) not null default 0 check (total >= 0),
  paid_at    timestamptz null,
  paid_by    uuid null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint order_checks_seq_key unique (order_id, seq),
  -- Auxiliar para la FK compuesta desde order_items y payments: garantiza que una
  -- línea no pueda apuntar a una subcuenta de OTRO pedido.
  constraint order_checks_order_id_key unique (order_id, id),
  constraint order_checks_paid_consistency check ((paid_at is null) = (paid_by is null))
);

create index order_checks_order_idx on public.order_checks (order_id);
create index order_checks_unpaid_idx on public.order_checks (order_id, seq) where paid_at is null;


-- -----------------------------------------------------------------------------
-- order_items · las líneas del pedido
-- -----------------------------------------------------------------------------
create table public.order_items (
  id                uuid primary key,  -- también generado en el cliente
  order_id          uuid not null references public.orders (id) on delete cascade,
  check_id          uuid not null,
  menu_item_id      uuid not null references public.menu_items (id) on delete restrict,
  variant_id        uuid null,

  qty               int not null check (qty > 0),

  -- Precio y nombres CONGELADOS al momento de tomar el pedido. Si el admin sube el
  -- precio a mitad de servicio, los pedidos abiertos conservan el suyo; y si renombra
  -- el plato, el recibo de ayer sigue diciendo lo correcto.
  unit_price        numeric(12, 2) not null check (unit_price >= 0),
  item_name         text not null,
  variant_name      text null,

  note              text null,  -- "sin cebolla" — lo lee Cocina en el papel
  line_total        numeric(12, 2) generated always as (qty * unit_price) stored,

  client_created_at timestamptz not null,
  created_at        timestamptz not null default now(),
  created_by        uuid not null references public.profiles (id) on delete restrict,

  -- Marca POR LÍNEA, no por pedido. Caja imprime la comanda; media hora después la
  -- mesa pide 3 cervezas sobre el mismo pedido. La segunda impresión debe llevar a
  -- Cocina SOLO lo nuevo, o se cocina dos veces lo mismo.
  printed_at        timestamptz null,

  -- Una línea ya impresa ya está en Cocina: si el cliente se arrepiente, no se borra,
  -- se ANULA. La comida se preparó y eso es información contable.
  voided_at         timestamptz null,
  voided_by         uuid null references public.profiles (id) on delete restrict,
  void_reason       text null,

  constraint order_items_check_belongs_to_order
    foreign key (order_id, check_id)
    references public.order_checks (order_id, id) on delete cascade,

  -- Impide guardar "Bandeja Paisa / media porción de Sancocho".
  constraint order_items_variant_belongs_to_item
    foreign key (variant_id, menu_item_id)
    references public.menu_item_variants (id, menu_item_id) on delete restrict,

  constraint order_items_void_consistency check ((voided_at is null) = (voided_by is null))
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_check_idx on public.order_items (check_id);
-- Lo que falta imprimir: la consulta que hace Caja en cada "imprimir adición".
create index order_items_unprinted_idx on public.order_items (order_id)
  where printed_at is null and voided_at is null;
create index order_items_menu_item_idx on public.order_items (menu_item_id);


-- -----------------------------------------------------------------------------
-- payments · pagos por subcuenta
-- -----------------------------------------------------------------------------
-- Un pago mixto son DOS filas (efectivo + transferencia) sobre la misma subcuenta,
-- no columnas nulables ni un método 'mixto'. Reportar "total por método" queda en un
-- `group by method` sin un solo CASE.
create table public.payments (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null,
  check_id   uuid not null,
  method     public.payment_method not null,
  amount     numeric(12, 2) not null check (amount > 0),
  tendered   numeric(12, 2) null,   -- efectivo: con cuánto pagó, para calcular el vuelto
  reference  text null,             -- transferencia: comprobante
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id) on delete restrict,

  constraint payments_check_belongs_to_order
    foreign key (order_id, check_id)
    references public.order_checks (order_id, id) on delete restrict,

  constraint payments_tendered_only_cash
    check (tendered is null or (method = 'efectivo' and tendered >= amount)),

  -- Máximo una fila por método y subcuenta: no hay "tres transferencias parciales"
  -- en v1, y evita duplicar pagos si `close_check` se reintenta.
  constraint payments_method_key unique (check_id, method)
);

create index payments_order_idx on public.payments (order_id);

-- Ojo: que la suma de los pagos iguale el total de la subcuenta NO es un constraint
-- (no se puede expresar entre filas sin triggers frágiles). Se valida dentro del RPC
-- `close_check`, en una sola transacción. Por eso el INSERT directo sobre `payments`
-- está revocado para los clientes en 05_rls.sql.


-- =============================================================================
-- Triggers de integridad
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Totales: subcuenta = suma de sus líneas no anuladas; pedido = suma de subcuentas.
-- -----------------------------------------------------------------------------
create or replace function public.tg_recalc_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_checks   uuid[] := '{}';
begin
  if tg_op = 'DELETE' then
    v_order_id := old.order_id;
    v_checks := array[old.check_id];
  elsif tg_op = 'INSERT' then
    v_order_id := new.order_id;
    v_checks := array[new.check_id];
  else
    v_order_id := new.order_id;
    -- En un UPDATE la línea pudo MOVERSE de subcuenta (división de cuenta):
    -- hay que recalcular la de origen y la de destino.
    v_checks := array[new.check_id, old.check_id];
  end if;

  update public.order_checks c
     set total = coalesce((
           select sum(i.line_total)
             from public.order_items i
            where i.check_id = c.id and i.voided_at is null
         ), 0)
   where c.id = any(v_checks);

  update public.orders o
     set total = coalesce((
           select sum(c.total) from public.order_checks c where c.order_id = o.id
         ), 0)
   where o.id = v_order_id;

  return null;
end;
$$;

create trigger order_items_recalc_totals
  after insert or update or delete on public.order_items
  for each row execute function public.tg_recalc_totals();


-- Crear o borrar una subcuenta también mueve el total del pedido.
create or replace function public.tg_recalc_order_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid := coalesce(new.order_id, old.order_id);
begin
  update public.orders o
     set total = coalesce((
           select sum(c.total) from public.order_checks c where c.order_id = o.id
         ), 0)
   where o.id = v_order_id;
  return null;
end;
$$;

create trigger order_checks_recalc_order_total
  after insert or delete on public.order_checks
  for each row execute function public.tg_recalc_order_total();


-- -----------------------------------------------------------------------------
-- Inmutabilidad contable: nada se toca después de pagar.
-- -----------------------------------------------------------------------------
create or replace function public.tg_lock_settled_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item    public.order_items := coalesce(new, old);
  v_status  public.order_status;
  v_paid_at timestamptz;
begin
  select o.status into v_status from public.orders o where o.id = v_item.order_id;
  if v_status = 'cerrado' then
    raise exception 'El pedido ya está cerrado y no admite cambios'
      using errcode = 'check_violation';
  end if;

  select c.paid_at into v_paid_at from public.order_checks c where c.id = v_item.check_id;
  if v_paid_at is not null then
    raise exception 'Esta cuenta ya fue pagada y no admite cambios'
      using errcode = 'check_violation';
  end if;

  -- En un UPDATE que mueve la línea, la subcuenta de ORIGEN tampoco puede estar pagada.
  if tg_op = 'UPDATE' and old.check_id <> new.check_id then
    select c.paid_at into v_paid_at from public.order_checks c where c.id = old.check_id;
    if v_paid_at is not null then
      raise exception 'La cuenta de origen ya fue pagada'
        using errcode = 'check_violation';
    end if;
  end if;

  return case tg_op when 'DELETE' then old else new end;
end;
$$;

create trigger order_items_lock_settled
  before insert or update or delete on public.order_items
  for each row execute function public.tg_lock_settled_items();


-- -----------------------------------------------------------------------------
-- Transiciones de estado válidas
-- -----------------------------------------------------------------------------
create or replace function public.tg_enforce_order_transitions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = new.status then
    return new;
  end if;

  if old.status = 'cerrado' then
    raise exception 'Un pedido cerrado no se puede reabrir' using errcode = 'check_violation';
  end if;
  if old.status = 'anulado' then
    raise exception 'Un pedido anulado no cambia de estado' using errcode = 'check_violation';
  end if;

  if new.status = 'anulado' then
    return new;  -- se puede anular desde cualquier estado abierto
  end if;

  if not (
       (old.status = 'pendiente' and new.status in ('impreso', 'en_mesa', 'cerrado'))
    or (old.status = 'impreso'   and new.status in ('en_mesa', 'cerrado'))
    or (old.status = 'en_mesa'   and new.status = 'cerrado')
  ) then
    raise exception 'Transición de estado inválida: % → %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger orders_enforce_transitions
  before update on public.orders
  for each row execute function public.tg_enforce_order_transitions();
