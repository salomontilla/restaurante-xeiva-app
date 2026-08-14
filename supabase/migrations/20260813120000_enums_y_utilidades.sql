-- =============================================================================
-- 01 · Enums y utilidades
-- =============================================================================
-- Los valores de estos enums son parte del dominio del código, no configuración
-- que el admin cambie. Un enum da validación gratis y tipos limpios en TypeScript.
-- Costo: agregar un valor requiere migración (ALTER TYPE ... ADD VALUE).
-- =============================================================================

create type public.user_role as enum ('mesero', 'caja', 'admin');

-- pendiente : el mesero lo envió, Caja aún no lo imprime
-- impreso   : Caja imprimió la comanda y el papel va camino a Cocina
-- en_mesa   : la comida ya está servida (previsto en CLAUDE.md; sin uso automático en v1)
-- cerrado   : todas las subcuentas pagadas; la mesa queda libre
-- anulado   : el pedido completo se canceló
create type public.order_status as enum ('pendiente', 'impreso', 'en_mesa', 'cerrado', 'anulado');

-- No existe 'mixto': un pago mixto son DOS filas en `payments` sobre la misma
-- subcuenta, una por método. Ver 03_pedidos.sql.
create type public.payment_method as enum ('efectivo', 'transferencia');


-- -----------------------------------------------------------------------------
-- Fecha de jornada
-- -----------------------------------------------------------------------------
-- El restaurante abre solo domingos y festivos y CIERRA A LAS 5:00 PM, así que una
-- jornada nunca cruza la medianoche: la fecha local del pedido identifica la jornada
-- sin necesidad de ningún corrimiento horario.
--
-- Se marca IMMUTABLE (y no STABLE, que es lo que sería `at time zone` en general)
-- para poder usarla en una columna generada. Es seguro aquí porque Colombia está en
-- UTC-5 fijo y no observa horario de verano desde 1993.
create or replace function public.to_business_date(ts timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (ts at time zone 'America/Bogota')::date
$$;

comment on function public.to_business_date is
  'Fecha de jornada (America/Bogota). IMMUTABLE a propósito para usarse en columnas generadas.';


-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
