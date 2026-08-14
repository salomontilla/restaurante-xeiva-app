-- =============================================================================
-- Seed de desarrollo
-- =============================================================================
-- Crea tres usuarios (uno por rol), dos salones con mesas, y una carta de ejemplo.
-- Es idempotente: se puede correr varias veces.
--
--   admin@xeiva.local  / xeiva123   → admin
--   caja@xeiva.local   / xeiva123   → caja
--   mesero@xeiva.local / xeiva123   → mesero
--
-- NO usar estas contraseñas en producción.
--
-- Nota: todo va en INSERTs planos, sin funciones auxiliares. La CLI de Supabase envía
-- el archivo como un solo batch y parsea TODAS las sentencias antes de ejecutar
-- ninguna, así que una función creada aquí mismo no existiría al momento de llamarla.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Usuarios
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('xeiva123', extensions.gen_salt('bf')), now(),
  now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', u.full_name),
  '', '', '', ''
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'admin@xeiva.local',  'Administrador'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'caja@xeiva.local',   'Caja'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'mesero@xeiva.local', 'Mesero de prueba')
) as u (id, email, full_name)
on conflict (id) do nothing;

-- Sin identidad de tipo email, GoTrue no encuentra al usuario al iniciar sesión.
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', u.id::text, now(), now(), now()
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'admin@xeiva.local'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'caja@xeiva.local'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'mesero@xeiva.local')
) as u (id, email)
on conflict (provider_id, provider) do nothing;

-- El rol vive aquí, no en un claim del JWT (ver docs/architecture.md → Seguridad).
insert into public.profiles (id, full_name, role)
values
  ('11111111-1111-4111-8111-111111111111', 'Administrador',    'admin'),
  ('22222222-2222-4222-8222-222222222222', 'Caja',             'caja'),
  ('33333333-3333-4333-8333-333333333333', 'Mesero de prueba', 'mesero')
on conflict (id) do update
  set full_name = excluded.full_name, role = excluded.role, is_active = true;


-- -----------------------------------------------------------------------------
-- Salones y mesas
-- -----------------------------------------------------------------------------
insert into public.dining_rooms (id, name, sort_order) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Mango', 1),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Frente', 2)
on conflict (id) do nothing;

insert into public.tables (dining_room_id, label, seats, sort_order)
select 'aaaaaaaa-0000-4000-8000-000000000001', n::text, 4, n
  from generate_series(1, 8) as n
on conflict do nothing;

insert into public.tables (dining_room_id, label, seats, sort_order)
select 'aaaaaaaa-0000-4000-8000-000000000002', 'F' || n::text, 6, n
  from generate_series(1, 5) as n
on conflict do nothing;


-- -----------------------------------------------------------------------------
-- Carta
-- -----------------------------------------------------------------------------
insert into public.menu_categories (id, name, sort_order) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Entradas', 1),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Fuertes', 2),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'Bebidas', 3)
on conflict (id) do nothing;

insert into public.menu_items (id, category_id, name, base_price, sort_order) values
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
   'Empanadas (3)', 9000, 1),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002',
   'Bandeja Paisa', 38000, 1),
  ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000002',
   'Sancocho de gallina', 32000, 2),
  ('cccccccc-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002',
   'Trucha al ajillo', 35000, 3),
  ('cccccccc-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000003',
   'Jugo natural', 8000, 1),
  ('cccccccc-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000003',
   'Gaseosa', 5000, 2)
on conflict (id) do nothing;

-- Variantes: la porción ESTÁNDAR no va aquí, es el `base_price` del plato.
-- Solo se listan las alternativas de menor precio que el admin predefine.
insert into public.menu_item_variants (menu_item_id, name, price, sort_order) values
  ('cccccccc-0000-4000-8000-000000000002', 'Media porción', 24000, 1),
  ('cccccccc-0000-4000-8000-000000000003', 'Media porción', 20000, 1),
  ('cccccccc-0000-4000-8000-000000000003', 'Porción pequeña', 15000, 2),
  ('cccccccc-0000-4000-8000-000000000004', 'Media porción', 22000, 1)
on conflict do nothing;

update public.restaurant_settings
   set name = 'Restaurante Xeiva',
       receipt_footer = '¡Gracias por su visita!'
 where id;
