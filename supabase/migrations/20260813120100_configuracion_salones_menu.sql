-- =============================================================================
-- 02 · Configuración: usuarios, salones, mesas, menú
-- =============================================================================
-- Todo lo de este archivo es CONFIGURACIÓN MUTABLE. El admin puede renombrar,
-- reordenar o desactivar cualquier cosa sin romper el histórico, porque los pedidos
-- congelan (snapshot) el nombre y el precio con que se vendieron. Ver 03_pedidos.sql.
--
-- Por eso todas las bajas son SOFT DELETE (`is_active`) y todas las FK hacia estas
-- tablas son ON DELETE RESTRICT: nunca se borra algo que un pedido histórico referencia.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- profiles · un rol por usuario
-- -----------------------------------------------------------------------------
-- Un solo rol por persona, sin tabla N:M: en un restaurante pequeño nadie es
-- "mesero y cajero a la vez". Si algún día pasa, se crea un segundo usuario.
-- El beneficio es que toda la RLS se vuelve trivial de leer.
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete restrict,
  full_name  text not null check (length(trim(full_name)) > 0),
  role       public.user_role not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ON DELETE RESTRICT arriba: borrar un usuario de auth no puede dejar pedidos
-- huérfanos. Dar de baja a alguien es `is_active = false`.

create index profiles_role_idx on public.profiles (role) where is_active;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.tg_touch_updated_at();


-- -----------------------------------------------------------------------------
-- dining_rooms · salones ("Mango", "Frente")
-- -----------------------------------------------------------------------------
create table public.dining_rooms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Unique solo entre activos: permite reutilizar el nombre de un salón desactivado.
create unique index dining_rooms_name_key on public.dining_rooms (lower(name)) where is_active;


-- -----------------------------------------------------------------------------
-- tables · mesas
-- -----------------------------------------------------------------------------
-- DECISIÓN CLAVE: no hay columna `status` ('libre'/'ocupada').
-- El estado se DERIVA de la existencia de un pedido abierto (ver el índice único
-- parcial `orders_one_open_per_table_key` en 03_pedidos.sql). Un booleano
-- denormalizado se desincroniza —pedido cerrado pero mesa marcada ocupada— y
-- obligaría a mantenerlo con triggers. Al derivarlo, cerrar el pedido libera la
-- mesa sin actualizar absolutamente nada.
create table public.tables (
  id                 uuid primary key default gen_random_uuid(),
  dining_room_id     uuid not null references public.dining_rooms (id) on delete restrict,
  label              text not null check (length(trim(label)) > 0),  -- "1", "A3", "Barra"
  seats              int null check (seats is null or seats > 0),
  -- Quién tomó la mesa. La toma el propio mesero (claim_table) y se limpia sola
  -- al pagar. Caja y Admin pueden reasignarla.
  assigned_waiter_id uuid null references public.profiles (id) on delete set null,
  sort_order         int not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

create unique index tables_label_key
  on public.tables (dining_room_id, lower(label)) where is_active;
create index tables_waiter_idx on public.tables (assigned_waiter_id) where is_active;
create index tables_room_idx on public.tables (dining_room_id) where is_active;


-- -----------------------------------------------------------------------------
-- menu_categories · agrupación de la carta
-- -----------------------------------------------------------------------------
-- Existe para que la lista del mesero no sea un scroll infinito en hora pico.
-- Es opcional: `menu_items.category_id` admite NULL.
create table public.menu_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  sort_order int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index menu_categories_name_key on public.menu_categories (lower(name)) where is_active;


-- -----------------------------------------------------------------------------
-- menu_items · platos de precio fijo
-- -----------------------------------------------------------------------------
-- `numeric(12,2)` y no float ni centavos en integer: es exacto, y como TODA la
-- aritmética de dinero ocurre en SQL (columnas generadas + triggers), JavaScript
-- nunca acumula pesos, solo formatea.
create table public.menu_items (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid null references public.menu_categories (id) on delete set null,
  name        text not null check (length(trim(name)) > 0),
  description text null,
  base_price  numeric(12, 2) not null check (base_price >= 0),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index menu_items_name_key on public.menu_items (lower(name)) where is_active;
create index menu_items_category_idx on public.menu_items (category_id, sort_order) where is_active;

create trigger menu_items_touch_updated_at
  before update on public.menu_items
  for each row execute function public.tg_touch_updated_at();


-- -----------------------------------------------------------------------------
-- menu_item_variants · catálogo de variantes POR PLATO
-- -----------------------------------------------------------------------------
-- CLAUDE.md: las variantes (media porción, porción pequeña) las predefine el Admin
-- con nombre y precio fijo; el mesero solo selecciona. Nunca texto libre.
--
-- DECISIÓN: la porción estándar NO es una fila aquí. El plato tiene `base_price` y
-- las variantes son alternativas opcionales. En `order_items`, `variant_id IS NULL`
-- significa porción estándar. Así el admin edita el precio normal en un solo lugar
-- y no hace falta la regla frágil "todo plato debe tener una variante default".
create table public.menu_item_variants (
  id           uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  price        numeric(12, 2) not null check (price >= 0),
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),

  -- Redundante frente a la PK, pero necesaria: permite la FK COMPUESTA desde
  -- order_items que garantiza a nivel de base de datos que una variante pertenece
  -- al plato que se pidió. Sin esto sería posible guardar
  -- "Bandeja Paisa / media porción de Sancocho".
  constraint menu_item_variants_item_id_key unique (menu_item_id, id)
);

create unique index menu_item_variants_name_key
  on public.menu_item_variants (menu_item_id, lower(name)) where is_active;


-- -----------------------------------------------------------------------------
-- restaurant_settings · fila única
-- -----------------------------------------------------------------------------
-- El truco `boolean primary key check (id)` garantiza a nivel de esquema que existe
-- EXACTAMENTE UNA fila, coherente con "un solo restaurante, no multi-tenant".
-- Encabeza comandas y recibos. `menu_version` la tocan las escrituras del menú para
-- que el PWA del mesero sepa si debe re-descargar el snapshot.
create table public.restaurant_settings (
  id             boolean primary key default true check (id),
  name           text not null default 'Restaurante',
  address        text null,
  phone          text null,
  receipt_footer text null,
  menu_version   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

insert into public.restaurant_settings (id, name) values (true, 'Restaurante Xeiva');

-- Cualquier cambio en la carta invalida el menú cacheado en los celulares.
create or replace function public.tg_bump_menu_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.restaurant_settings set menu_version = now(), updated_at = now() where id;
  return null;
end;
$$;

create trigger menu_items_bump_version
  after insert or update or delete on public.menu_items
  for each statement execute function public.tg_bump_menu_version();

create trigger menu_item_variants_bump_version
  after insert or update or delete on public.menu_item_variants
  for each statement execute function public.tg_bump_menu_version();

create trigger menu_categories_bump_version
  after insert or update or delete on public.menu_categories
  for each statement execute function public.tg_bump_menu_version();
