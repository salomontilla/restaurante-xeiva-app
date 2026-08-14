-- =============================================================================
-- 04 · Helpers de rol para RLS
-- =============================================================================
-- DECISIÓN: el rol se resuelve consultando `profiles`, NO con un claim en el JWT.
--
-- Motivos:
--   1. Revocación inmediata. Si el admin desactiva a un mesero, con claims en el JWT
--      el cambio no aplica hasta que el token se refresque — y aquí el token del
--      mesero dura horas a propósito, para que sobreviva un turno sin señal.
--   2. Menos ops en self-hosted: el custom access token hook obliga a configurar
--      GoTrue y a mantener sincronizado `profiles` con `raw_app_meta_data`. Dos
--      fuentes de verdad para el rol es justo la complejidad que este proyecto evita.
--   3. El costo es nulo a esta escala: las funciones son STABLE (Postgres las evalúa
--      una vez por statement, no por fila) y `profiles` tiene ~10 filas en caché.
--
-- Si algún día hubiera cientos de usuarios, mover el rol al JWT es la optimización
-- obvia y solo habría que reescribir `app_role()`.
--
-- SECURITY DEFINER es OBLIGATORIO, no opcional: sin él, una política sobre `profiles`
-- que consulta `profiles` entra en recursión infinita. Y `set search_path = ''` con
-- nombres calificados es requisito de seguridad para toda función DEFINER.
--
-- Nota de nombre: se llama `app_role()` y no `current_role()` porque CURRENT_ROLE es
-- una palabra reservada de SQL (devuelve el rol de Postgres, no el del negocio).
-- =============================================================================

create or replace function public.app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() = 'admin', false)
$$;

create or replace function public.is_caja_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.app_role() in ('caja', 'admin'), false)
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.app_role() is not null
$$;


-- ¿La mesa la tomó el usuario actual? Base de "el mesero solo edita sus mesas".
create or replace function public.owns_table(p_table_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tables t
     where t.id = p_table_id and t.assigned_waiter_id = auth.uid()
  )
$$;


-- Un mesero VE todas las mesas activas (para responderle al cliente o ubicar a un
-- compañero) y además su propio histórico. Caja y admin ven todo.
create or replace function public.can_view_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_caja_or_admin()
      or exists (
        select 1 from public.orders o
         where o.id = p_order_id
           and (o.status <> 'cerrado' or o.waiter_id = auth.uid())
      )
$$;


-- Pero solo EDITA los pedidos de las mesas que él tomó, y solo mientras estén abiertos.
create or replace function public.can_edit_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and o.status not in ('cerrado', 'anulado')
       and (public.is_caja_or_admin() or public.owns_table(o.table_id))
  )
$$;
