# Restaurante Xeiva

Plataforma web para un restaurante de un solo local: los meseros toman el pedido desde su celular,
Caja lo imprime y lo manda a Cocina en papel, cobra y libera la mesa, y el Admin administra salones,
carta, usuarios y ventas.

El local está en zona rural con **WiFi intermitente**, así que la vista del mesero es una PWA
offline-first: el pedido se guarda en el celular apenas se toma y se reintenta solo cuando vuelve la
señal. No es una mejora opcional, es el requisito que condiciona todo el diseño.

- **Negocio y reglas** → [`CLAUDE.md`](./CLAUDE.md) (fuente de verdad; cualquier regla nueva se
  documenta ahí *antes* de implementarse)
- **Decisiones técnicas y por qué** → [`docs/architecture.md`](./docs/architecture.md)

## Stack

| | |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 |
| Backend | Supabase self-hosted — Postgres + RLS, Auth, Realtime |
| Offline | Dexie (IndexedDB) + outbox propio · PWA con Serwist |
| Impresión | `window.print()` con plantilla CSS — impresora normal de hojas, no térmica |

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local     # y rellenar con los datos del Supabase self-hosted
```

### Supabase local

```bash
supabase start        # levanta el stack completo en Docker
supabase db reset     # re-aplica migraciones + seed desde cero
supabase status       # URLs y claves
```

Los puertos están en el rango **5434x** (`supabase/config.toml`) para no chocar con otros
stacks locales de Supabase en la misma máquina:

| | |
|---|---|
| API (Kong) | http://127.0.0.1:54341 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54342/postgres` |
| Studio | http://127.0.0.1:54343 |
| Mailpit | http://127.0.0.1:54344 |

Dos ajustes en `config.toml` que **también hay que replicar en el self-hosted**:
`jwt_expiry = 28800` (8 h, para que el mesero sobreviva un turno sin señal) y
`enable_signup = false` (nadie se registra solo).

### Migraciones y tipos

SQL plano en `supabase/migrations/`, numeradas y en orden de dependencia. `supabase start` y
`db reset` las aplican solas junto con el seed.

```bash
export SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54342/postgres"

pnpm db:push      # aplicar contra otra base (ej. el self-hosted)
pnpm gen:types    # regenera lib/db.types.ts  ← HACERLO DESPUÉS DE CADA MIGRACIÓN
```

Usuarios del seed (contraseña `xeiva123` — **no usar en producción**):
`admin@xeiva.local` · `caja@xeiva.local` · `mesero@xeiva.local`

### Pruebas

```bash
pnpm test:db      # 22 casos sobre el esquema (no necesita la app corriendo)
pnpm test:auth    # login y guards por rol (necesita `pnpm dev` corriendo)
pnpm typecheck && pnpm lint
```

`test:db` cubre idempotencia del envío offline, adiciones que solo imprimen lo nuevo, división
de cuentas, pago mixto y los negativos de RLS de cada rol. Corre como `authenticated`
suplantando el claim del JWT, **no** con service_role: probar RLS con service_role no prueba
nada, porque la ignora.

`test:auth` inicia sesión con la misma librería que usa la app para producir cookies reales, y
comprueba a dónde aterriza cada rol — incluida la revocación inmediata al desactivar a alguien
con su token todavía vigente.

### Desarrollo

```bash
pnpm dev
```

## Estructura

```
app/            rutas por rol en route groups: (auth) (mesero) (caja) (admin)
modules/        código por DOMINIO: auth · salones-mesas · menu · pedidos · pagos · ventas · offline
lib/            supabase/{browser,server,admin} · db.types.ts (generado) · money · result
components/     ui/ (design system) · layout/
supabase/       migrations/ · seed.sql · tests/
docs/           architecture.md
```

Dos convenciones que importan:

- **Los componentes compartidos entre roles viven en su módulo de dominio**, no en un
  `components/shared/`. El selector de variantes es del dominio `menu`, lo use el mesero o Caja. En
  `components/` solo va el sistema de diseño, agnóstico del negocio.
- **`lib/db.types.ts` es generado**, nunca se edita a mano.

## Requisitos de infraestructura (no son código)

- **`JWT_EXPIRY` de GoTrue en 8-12 h.** Si el token del mesero expira sin señal, queda bloqueado con
  pedidos sin enviar. Es seguro porque el rol se resuelve contra `profiles`, no contra un claim del
  token, así que un token largo no retrasa una revocación.
- **HTTPS con hostname real en la LAN** (no una IP) detrás del reverse proxy: los service workers no
  corren en contexto inseguro y sin ellos no hay PWA.

## Estado

| Fase | |
|---|---|
| 0 · Infraestructura, clientes de Supabase, tipos | ✅ |
| 1 · Esquema, RLS, RPCs, vistas, seed y pruebas | ✅ |
| 2 · Auth, guards y route groups por rol | ✅ |
| 3 · Admin: salones, mesas, menú, usuarios | ⬜ |
| 4 · Capa offline + vista Mesero (PWA) | ⬜ |
| 5 · Caja: mapa realtime, detalle, impresión | ⬜ |
| 6 · Pagos, división de cuentas y cierre | ⬜ |
| 7 · Ventas y reportes | ⬜ |
