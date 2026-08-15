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
| Offline | Dexie (IndexedDB) + outbox propio · PWA con service worker propio |
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
pnpm test:offline # capa offline del mesero      (no necesita nada corriendo)
pnpm test:db      # 22 casos sobre el esquema    (no necesita la app corriendo)
pnpm test:auth    # login y guards por rol       (necesita `pnpm dev` corriendo)
pnpm test:admin   # pantallas y CRUD del admin   (necesita `pnpm dev` corriendo)
pnpm test:caja    # comandas, impresión, Realtime (necesita `pnpm dev` corriendo)
pnpm test:pagos   # división de cuentas y cobro  (necesita `pnpm dev` corriendo)
pnpm test:arqueo  # arqueo de caja               (necesita `pnpm dev` corriendo)
pnpm test:ventas  # reportes por jornada         (necesita `pnpm dev` corriendo)
pnpm typecheck && pnpm lint
```

`test:arqueo` demuestra lo único que hace útil a un arqueo: que sea una **foto**. Anula una línea ya
cobrada *después* de cerrar la caja y comprueba que el esperado y el descuadre no se muevan. Cubre
además retiros del cajón, cierre con descuadre (permitido, con observación obligatoria), cobros
posteriores al cierre y la corrección por parte del admin.

> `test:ventas` **borra todos los pedidos** y siembra jornadas históricas, para que los
> totales del tablero sean predecibles. Córrelo al final, o resetea después.

`test:ventas` comprueba que los números cuadren, que es lo único que importa en un reporte:
totales por jornada, efectivo + transferencia = total, y que un pedido **abierto** no se cuente
como venta.

> Tras un `supabase db reset`, el contenedor de Realtime tarda un momento en volver.
> `test:caja` espera el estado `SUBSCRIBED` antes de provocar el cambio (hasta 15 s), así
> que no hace falta pausar a mano — pero si falla justo después de un reset, reintenta.

`test:pagos` cubre la fase que mueve dinero, sobre todo por lo que NO debe poder pasar: cobrar
un monto que no cuadra, mover platos de una cuenta ya pagada, cobrar dos veces, o que el mesero
vea los pagos. Verifica además que al pagar la última subcuenta la mesa quede libre sola.

`test:caja` abre un WebSocket de verdad y comprueba que el evento de Realtime llegue: la
publicación de Postgres puede estar perfecta y el evento no llegar nunca, así que es la única
forma de saberlo. Cubre además el ciclo de comandas: imprimir, adición que solo trae lo nuevo,
reimpresión completa, y anulación de una línea ya impresa.

`test:offline` es el más importante del proyecto: ejercita borradores, outbox y motor de
sincronización con Dexie **real** sobre un IndexedDB de mentira en Node, simulando solo la
respuesta de Supabase. Cubre el caso que exige CLAUDE.md — se va la señal a mitad del
pedido y no se pierde nada — más idempotencia del reenvío, adiciones que solo mandan lo
nuevo, y la diferencia entre error de red (se reintenta solo) y error de negocio (se le
muestra a la persona).

`test:db` cubre idempotencia del envío offline, adiciones que solo imprimen lo nuevo, división
de cuentas, pago mixto y los negativos de RLS de cada rol. Corre como `authenticated`
suplantando el claim del JWT, **no** con service_role: probar RLS con service_role no prueba
nada, porque la ignora. Limpia sus propios datos al arrancar, así que se puede correr varias
veces seguidas.

`test:auth` inicia sesión con la misma librería que usa la app para producir cookies reales, y
comprueba a dónde aterriza cada rol — incluida la revocación inmediata al desactivar a alguien
con su token todavía vigente.

`test:admin` comprueba que las pantallas de administración rendericen (es donde se notan los
`select` mal escritos y las políticas que niegan una lectura), que Caja no entre, y que las
operaciones de las Server Actions funcionen bajo RLS: nombres repetidos rechazados, baja de un
salón que arrastra sus mesas, y reutilización del nombre una vez dado de baja.

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
| 3 · Admin: salones, mesas, menú, usuarios | ✅ |
| 4 · Capa offline + vista Mesero (PWA) | ✅ |
| 5 · Caja: mapa realtime, detalle, impresión | ✅ |
| 6 · Pagos, división de cuentas y cierre | ✅ |
| 7 · Ventas y reportes | ✅ |
| 8 · Arqueo de caja y notas por línea | ✅ |
