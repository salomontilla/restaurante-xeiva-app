# Arquitectura — Restaurante Xeiva

Referencia de las decisiones estructurales del proyecto. **CLAUDE.md** es la fuente de verdad
del *negocio*; este documento explica el **por qué** de cómo se modeló, para no repetir la
discusión. Si una regla de negocio cambia, se documenta primero en CLAUDE.md y luego aquí.

---

## Principios

1. **Un solo restaurante.** Nada de `tenant_id`, nada de jerarquías de organización.
2. **La historia vive en los pedidos, no en la configuración.** Salones, mesas, platos y variantes
   son configuración mutable; los pedidos congelan (snapshot) lo que necesitan —salón, mesa, nombre
   del plato, precio— para que el admin pueda renombrar o desactivar cualquier cosa sin corromper
   reportes ni recibos ya emitidos. Por eso toda baja es *soft delete* y toda FK hacia configuración
   es `ON DELETE RESTRICT`.
3. **El id lo genera el cliente.** Es la base de la idempotencia offline y no cuesta nada.
4. **RLS es la frontera de seguridad real**, no el servidor de Next.

---

## Modelo de datos

```
profiles ──┬─< tables >── dining_rooms
           │      │
           │      └──< orders ──< order_checks ──< order_items >── menu_items ──< menu_item_variants
           │                          │                                  └── menu_categories
           └──────────────────────────┴──< payments
```

### Estado de mesa: derivado, no almacenado

`tables` **no tiene** columna `status`. "Ocupada" significa que existe un pedido con
`status in ('pendiente','impreso','en_mesa')`, garantizado único por el índice parcial
`orders_one_open_per_table_key`.

*Por qué*: un booleano denormalizado se desincroniza —pedido cerrado pero mesa marcada ocupada es
el bug clásico— y obliga a mantenerlo con triggers. Al derivarlo, **cerrar un pedido libera la mesa
sin actualizar nada**. El costo es un `left join`, resuelto de una vez en la vista `v_table_map`,
sobre 20-40 filas.

### Dinero

`numeric(12,2)`, nunca float ni centavos en integer. Toda la aritmética ocurre en SQL:
`order_items.line_total` es columna generada, y los totales de `order_checks` y `orders` los mantiene
el trigger `tg_recalc_totals`. **JavaScript nunca suma pesos, solo formatea** (`lib/money.ts`).
Los clientes no tienen `GRANT` sobre esas columnas: aunque una política fuera permisiva de más, no
pueden alterar un total.

Sin impuestos, propinas ni descuentos (CLAUDE.md): `total = suma de líneas no anuladas`.

### Variantes de plato

La porción **estándar no es una fila** de variante: el plato tiene `base_price` y las variantes son
alternativas opcionales; en `order_items`, `variant_id IS NULL` = porción estándar. Así el admin
edita el precio normal en un solo lugar y no hace falta la regla frágil "todo plato debe tener una
variante marcada como default".

La FK compuesta `order_items(variant_id, menu_item_id) → menu_item_variants(id, menu_item_id)`
impide a nivel de base de datos guardar "Bandeja Paisa / media porción de Sancocho". Para eso existe
el `unique (menu_item_id, id)` en `menu_item_variants`, que parece redundante frente a la PK pero no
lo es.

### Subcuentas (`order_checks`)

Todo pedido nace con la subcuenta `seq = 1`, creada por `submit_order`. Si nadie pide dividir, esa
única subcuenta *es* la cuenta y el usuario nunca ve el concepto. Cuando los comensales quieren pagar
por separado, Caja crea seq 2, 3… y arrastra líneas con `split_order`.

La misma FK compuesta (`order_items(order_id, check_id) → order_checks(order_id, id)`) garantiza que
una línea no pueda apuntar a la subcuenta de otro pedido.

Un plato pertenece a **una sola** subcuenta; si dos personas comparten uno, `split_order_line` parte
la línea por cantidad.

### Impresión por línea

`order_items.printed_at`, no `orders.printed_at` a secas. Caja imprime la comanda; media hora después
la mesa pide 3 cervezas sobre el mismo pedido. Si "impreso" fuera del pedido, la segunda impresión
repetiría las bandejas y Cocina las haría de nuevo. El índice parcial
`order_items_unprinted_idx` hace trivial la consulta "qué falta imprimir".

Corolario: una línea ya impresa ya está en Cocina. Se **anula** (`voided_at`), no se borra — es
información contable. Borrar solo se permite mientras `printed_at is null`.

### Jornada de negocio

El restaurante abre solo domingos y festivos y cierra a las 5 PM: una jornada nunca cruza medianoche,
así que `orders.business_date` es simplemente la fecha local de apertura, como columna generada.

Se usa la función `to_business_date`, marcada `IMMUTABLE` (y no `STABLE`, que es lo que sería
`at time zone` en general) porque una columna generada exige una expresión inmutable. Es seguro aquí:
Colombia está en UTC-5 fijo y no observa horario de verano desde 1993.

---

## Idempotencia y flujo offline

**La garantía de no-duplicación es la PRIMARY KEY**, generada en el navegador del mesero (uuid v7)
antes de tocar la red, combinada con `INSERT ... ON CONFLICT (id) DO NOTHING` dentro de
`submit_order`. No hay tabla de idempotency keys ni deduplicación por contenido.

1. El mesero toca "Nueva mesa" → el cliente genera `orderId` y lo guarda en IndexedDB.
2. Cada plato genera su propio `itemId` y se persiste al instante.
3. "Enviar" encola una op en el outbox; la UI confirma de inmediato (optimista).
4. El sync engine llama `submit_order`. Un reintento manda **exactamente los mismos uuids**, así que
   ambos inserts son no-op.

**`DO NOTHING` y no `DO UPDATE`**: un reintento no debe pisar cambios que Caja hizo mientras el mesero
estaba sin señal. Desde el mesero, el pedido es *append-only*.

**Una sola operación en el outbox.** `submit_order` sirve para crear y para agregar: si el pedido ya
existe, la cabecera se ignora y solo entran las líneas nuevas. La cola es homogénea, de un solo tipo,
y reintentable en orden.

**Los precios los resuelve el servidor.** El payload manda `menu_item_id` + `variant_id` + `qty`,
nunca precios: un celular con la carta cacheada vieja mandaría precios viejos, y un cliente manipulado
podría cobrar $0. El RPC resuelve el precio **ignorando `is_active`** — la comida ya se sirvió, no se
puede rechazar un pedido físico por un cambio de carta.

**`uuid v7` y no v4**: es monótono en el tiempo, así que los inserts no fragmentan el índice de la PK.
Cuesta lo mismo.

| Escenario | Comportamiento |
|---|---|
| La mesa ya tiene otro pedido abierto | `TABLE_ALREADY_OPEN` + `current_order_id`; la UI ofrece fusionar (reenviar las líneas con ese order_id — conservan su uuid, sigue siendo idempotente) |
| La mesa ya se cerró | `ORDER_CLOSED`; la op queda en estado `conflict` en el outbox y se le muestra al mesero *(pendiente decidir el flujo exacto de UI)* |
| Plato desactivado mientras estaba offline | Se acepta la línea |
| Reloj del celular desfasado | `client_created_at` se guarda pero **nunca** se usa para reportes ni para `business_date` |

### El punto de falla más probable: expiración del JWT offline

supabase-js refresca el access token cada hora; si el refresh falla repetidamente sin señal, la sesión
se puede perder y el mesero queda bloqueado **con pedidos sin enviar**. Mitigaciones obligatorias:

- Subir `JWT_EXPIRY` de GoTrue a ~8-12 h (cubre un turno). Es seguro precisamente porque el rol se
  resuelve contra `profiles` y no contra un claim, así que un token largo no retrasa una revocación.
- `persistSession: true`, `autoRefreshToken: true`, y **no** cerrar sesión ante fallos de red
  (distinguir error de red de `invalid_grant`).
- Indicador permanente en la UI: "sin conexión" + "N pedidos pendientes de enviar".

---

## Seguridad (RLS)

### El rol se resuelve contra `profiles`, no contra el JWT

Funciones `SECURITY DEFINER STABLE`: `app_role()`, `is_admin()`, `is_caja_or_admin()`, `is_staff()`,
`owns_table()`, `can_view_order()`, `can_edit_order()`.

*Por qué no el custom access token hook:*

1. **Revocación inmediata.** Con claims en el JWT, desactivar a un mesero no aplica hasta que el token
   se refresque — y aquí el token dura horas a propósito.
2. **Menos ops en self-hosted.** El hook obliga a configurar GoTrue y a mantener sincronizado
   `profiles` con `raw_app_meta_data`: dos fuentes de verdad para el rol.
3. **El costo es nulo a esta escala.** Son `STABLE`, Postgres las evalúa una vez por statement, y
   `profiles` tiene ~10 filas en caché.

Si algún día hubiera cientos de usuarios, mover el rol al JWT es la optimización obvia y solo habría
que reescribir `app_role()`.

`SECURITY DEFINER` es obligatorio: sin él, una política sobre `profiles` que consulta `profiles` entra
en recursión infinita. `set search_path = ''` con nombres calificados es requisito de seguridad para
toda función DEFINER.

> Se llama `app_role()` y no `current_role()` porque `CURRENT_ROLE` es palabra reservada de SQL.

### Matriz de permisos

| Tabla | mesero | caja | admin |
|---|---|---|---|
| `profiles` | SELECT | SELECT | ALL |
| `dining_rooms`, `menu_*` | SELECT | SELECT | ALL |
| `tables` | SELECT (toma mesa vía `claim_table`) | SELECT + UPDATE | ALL |
| `orders` | SELECT (todas las abiertas + su histórico); UPDATE solo `note` | SELECT todo; UPDATE `note` | ALL |
| `order_checks` | SELECT | SELECT | ALL |
| `order_items` | SELECT; UPDATE `qty`/`note` y DELETE **solo si no está impresa**, y solo en sus mesas | igual, sobre cualquier mesa activa | ALL |
| `payments` | **ninguno** | SELECT | ALL |

**"Ve todas, edita solo las suyas"**: un mesero puede consultar cualquier pedido abierto (para
responderle al cliente o ubicar a un compañero) pero solo escribe donde `owns_table()`. Las mesas son
legibles por todos: restringirlas a "las mías" rompería la pantalla de elegir mesa, que existe
justamente para ver las libres.

**No se usa `FORCE ROW LEVEL SECURITY`**: los RPC son `SECURITY DEFINER` y corren como el dueño de las
tablas, que debe poder saltarse las políticas para escribir totales y pagos.

**Escritura de dinero y estado: siempre por RPC.** No se concede `INSERT` sobre `orders`,
`order_items` ni `payments`. Aunque una política resultara permisiva de más, el `GRANT` no existe.

**Vistas con `security_invoker = on`.** Sin eso una vista corre con los permisos de su dueño y **no
filtra nada** — es el error de seguridad más común en Supabase.

---

## Contratos por módulo

Regla: **lecturas simples = query directa con RLS; escrituras que tocan varias tablas, dinero o
estado = RPC.**

Todos los RPC devuelven `{ ok, code, ... }` en vez de lanzar excepción para los casos de negocio
esperados. Es deliberado: el cliente offline necesita distinguir un error de **negocio** (mostrárselo
a la persona, no reintentar) de uno de **red** (reintentar solo). Códigos en `lib/result.ts`.

| Módulo | Contrato |
|---|---|
| Auth | Query directa a `profiles`. Crear usuarios **no es un RPC**: requiere la Admin API de GoTrue con service_role → Server Action (`modules/auth/actions.ts`). Es el único módulo que obliga a tener un BFF. |
| Salones y mesas | Vista `v_table_map` (única consulta de la pantalla de Caja). CRUD directo (admin). RPC `claim_table`. |
| Menú | Query directa; RPC `get_menu_snapshot()` para el caché offline (todo el árbol + `version` en una llamada). |
| Pedidos | RPC `submit_order`, `get_order_ticket`, `mark_order_printed`, `void_order_item`, `split_order_line`. |
| Pagos | RPC `split_order`, `close_check`, `get_receipt`. |
| Ventas | Vistas `v_sales_daily`, `v_sales_by_dining_room`, `v_sales_by_item`, `v_sales_by_waiter`; RPC `sales_summary(from, to)`. |

`v_sales_by_item` es además el insumo exacto de la futura fase de análisis de compras con IA
(CLAUDE.md módulo 7), sin haber agregado nada al esquema hoy.

### Realtime

Publicación sobre `orders`, `order_checks` y `tables`. **No** sobre `order_items`: suscribir el
detalle de todas las mesas es ruido; Caja recarga el detalle con un fetch al abrir una mesa.

`replica identity` queda en *default* (no `full`): el cliente re-consulta al recibir el evento, en vez
de recibir el row completo en cada cambio. Menos tráfico, que es lo que importa con WiFi intermitente.

---

## Decisiones de frontend

### Offline: Dexie/IndexedDB + outbox propio

*No PowerSync/RxDB*: son motores de sincronización bidireccional de conjuntos de datos. El problema
real aquí es **una sola operación de escritura** que debe reintentarse, más dos lecturas cacheables.
Además exigirían otro servicio corriendo junto al Supabase self-hosted en un servidor rural.

*No localStorage*: síncrono (bloquea la UI), sin transacciones, sin índices, ~5MB. Un pedido a medio
escribir en un celular que se queda sin batería es justo el caso donde se quiere durabilidad.

Cuatro stores: `menu` (snapshot + version), `myTables`, `drafts` (se escribe **en cada interacción**,
no al enviar), `outbox`.

Flush **serial FIFO** disparado por: enqueue · evento `online` · `visibilitychange`→visible · backoff
exponencial con jitter 2s→30s. Background Sync API solo como bonus: **no existe en iOS/Safari**.

`navigator.onLine` miente con WiFi conectado pero sin ruta al servidor — precisamente el caso del
viento. La fuente de verdad es el **resultado de la llamada real**; `onLine` es solo un hint.

**Tomar una mesa es la única acción del mesero que exige conexión**: dos meseros offline no pueden
resolver entre sí quién tomó la mesa 5. Sin señal, la UI bloquea tomar mesas *nuevas* pero deja seguir
agregando platos a las que ya son suyas.

PWA con `@serwist/next`: precache del shell de `/mesero`, `NetworkFirst` para datos, **nunca** cachear
`/auth/v1`. Requiere HTTPS con **hostname real** en la LAN (no IP): los service workers no corren en
contexto inseguro.

### UI: shadcn/ui sobre Tailwind v4

Las tres vistas comparten primitivos accesibles (dialog para el selector de variantes, sheet para el
carrito móvil, select, popover) y el admin necesita tablas y formularios que serían semanas con
primitivos propios. Como shadcn **copia el código al repo**, la vista de mesero reescribe densidad y
targets táctiles (mín. 44px) sin pelear con la API de una librería.

*No Mantine*: trae su propio sistema de estilos que compite con Tailwind v4 y engorda el bundle —
inaceptable en una PWA en gama media con WiFi malo.

### Acceso a datos: híbrido por módulo

| Vista | Estrategia | Por qué |
|---|---|---|
| Mesero | `supabase-js` directo, 100% | Si el server de Next se cae, el mesero debe poder seguir tomando y enviando pedidos |
| Caja | `supabase-js` directo (cliente) | Realtime exige WebSocket desde el navegador; `window.print()` es puramente cliente |
| Admin | Server Components + Server Actions | No necesita offline ni realtime; y crear usuarios exige service_role, que jamás va al navegador |

**Consecuencia que hay que aceptar explícitamente**: como dos de las tres vistas hablan directo con
Postgres, no puede existir ninguna regla de negocio que solo se valide en el servidor de Next. Todo lo
que importa está en políticas, constraints, triggers y RPCs. Eso es lo que hace seguro el modo offline.

---

## Verificación

`supabase/tests/flujo_completo.sql` cubre 22 casos, ejecutándose como `authenticated` suplantando el
claim `sub` (probar RLS con service_role no prueba nada, porque la ignora): idempotencia del reenvío,
adiciones que solo imprimen lo nuevo, división de cuentas, pago mixto, rechazo de pago que no cuadra,
liberación automática de la mesa, pedido tardío sobre mesa cerrada, y los negativos de cada rol.

---

## Reglas de negocio aún sin decidir

No se asumen; deben escribirse en CLAUDE.md antes de implementarse.

- **Conflicto de sync**: qué hace la UI cuando un pedido offline llega a una mesa que Caja ya cerró.
- **Notas por línea**: el esquema tiene `order_items.note`; falta decidir si la UI lo expone y si
  Cocina las lee.
- **`en_mesa`**: en el flujo real es casi el mismo momento que `impreso`. Probablemente sobra y el
  ciclo debería ser `pendiente → impreso → cerrado`.
- **Anular un pedido completo** (`status = 'anulado'`): el enum lo contempla, no hay RPC todavía.
- **Reapertura de una mesa cerrada por error**: ¿se permite? ¿solo admin? ¿deja rastro?
- **Traslado de pedido entre mesas**, pedidos para llevar sin mesa, número de comensales.
- **Cuenta de Caja**: ¿un usuario compartido en la estación o uno por cajero? Afecta la utilidad de
  `closed_by` para arqueo.
