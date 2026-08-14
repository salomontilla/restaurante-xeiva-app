# Contexto del proyecto — Plataforma Web para Restaurante

## Descripción general

Aplicación web para un restaurante (un solo local, no multi-tenant) ubicado en zona rural con WiFi local
de señal intermitente (afectada por viento). Permite a los meseros tomar pedidos desde su celular, que
llegan a Caja para imprimirse y enviarse a Cocina, y da a Caja y Admin control sobre mesas, ventas y menú.

## Roles y flujo principal

1. **Mesero** (celular, PWA): ve el listado de mesas, **toma él mismo cualquier mesa libre** (no se la
   asigna nadie), y toma el pedido. La mesa queda asignada a ese mesero mientras el pedido esté abierto,
   y se libera automáticamente al registrarse el pago. Cada mesero tiene su propio usuario, gestionado
   por el Admin. Un mesero **ve** todas las mesas activas (para responderle al cliente o ubicar a un
   compañero) pero **solo edita los pedidos de las mesas que él tomó**. El sistema NO registra quién
   ayudó a tomar nota; si otro mesero ayuda, el dueño de la mesa o Caja ingresa los platos.
2. **Caja**: recibe el pedido, lo imprime (impresora normal de hojas conectada localmente en la estación
   de Caja — no térmica), y el ticket se lleva físicamente a Cocina. Caja ve un mapa en tiempo real de qué
   mesas están libres/ocupadas (Supabase Realtime). Desde el detalle de cada mesa puede seguir modificando
   el pedido (agregar platos, variantes) mientras la mesa está activa.
3. **Cocina**: NO tiene pantalla ni usuario en el sistema. Solo ve el papel impreso que le lleva Caja.
4. **Cierre de mesa / pago**: cuando el cliente paga, la mesa se libera y se genera un recibo (imprimible
   bajo demanda, no siempre se entrega). Métodos de pago: efectivo, transferencia, o mixto entre ambos
   (NO hay pago con tarjeta).
5. **Admin**: crea y administra salones del restaurante (ej. "Mango", "Frente"), y las mesas dentro de
   cada salón. Administra el menú (platos + catálogo de variantes). Administra usuarios de meseros.
   Tiene visibilidad de ventas/reportes.

## Reglas de negocio clave

- **Variantes de plato**: los platos del menú tienen precio fijo, pero existen variantes no estándar
  (medias porciones, porciones pequeñas) con precio más bajo. Se manejan mediante un **catálogo de
  variantes por plato**, predefinido por el Admin (nombre + precio fijo por variante), que el mesero
  selecciona al tomar el pedido. No se maneja como texto libre.
- **Sin inventario/stock en v1**: el restaurante compra la comida y calcula cantidades a mano cada fin
  de semana, de forma variable según temporada. No se requiere control de stock ahora. Posible fase
  futura: análisis de compras/consumo asistido por IA — NO implementar en v1, solo dejar el modelo de
  datos abierto a esa posibilidad si es sencillo hacerlo.
- **Conectividad intermitente**: el flujo de toma de pedidos del mesero debe tolerar cortes breves de
  señal — guardar el pedido localmente (IndexedDB u otro almacenamiento local) y reintentar el envío
  automáticamente cuando vuelve la conexión. Esto es un requisito crítico, no opcional.
- **Sin impuestos, propinas ni descuentos**: el total de un pedido es exactamente la suma de sus líneas.
  No se cobra IVA/INC, no se cobra servicio, no se aplican rebajas ni cortesías. Si esto cambiara, hay
  que documentarlo aquí antes de tocar el esquema (afecta pedidos y recibo).
- **Jornada y horario**: el restaurante abre **solo domingos y festivos** y **cierra a las 5:00 PM**.
  Una jornada nunca cruza la medianoche, así que el "día de venta" es simplemente la fecha del pedido
  (zona horaria `America/Bogota`). Los reportes se agrupan por jornada, no por calendario continuo.
- **Toma de mesa por el mesero**: las mesas libres están disponibles para cualquier mesero; el primero
  que la toma queda como dueño hasta que se registre el pago. Caja y Admin pueden editar cualquier mesa
  activa sin importar quién la tomó.
- **Adiciones e impresión por línea**: una mesa puede pedir más platos después de que Caja ya imprimió
  la comanda. El sistema marca qué líneas ya se imprimieron, de modo que la segunda impresión lleve a
  Cocina **solo lo nuevo** y no se prepare dos veces lo mismo.
- **División de cuentas (split)**: a veces los comensales de una misma mesa quieren pagar por separado.
  La división es **por platos** (cada quien paga lo que consumió), no por montos arbitrarios, y la hace
  **Caja al momento de cobrar** — el mesero siempre toma el pedido completo, sin separar. Caja crea las
  subcuentas necesarias sobre el pedido y arrastra cada línea a la subcuenta que corresponda. Cada
  subcuenta tiene su propio total, su propio pago (efectivo/transferencia/mixto) y su propio recibo.
  La mesa se libera cuando **todas** las subcuentas están pagadas. Un plato pertenece a una sola
  subcuenta; si dos personas comparten un plato, la línea se divide en dos líneas por cantidad.
- **Anulación de líneas**: el mesero puede eliminar libremente las líneas que **aún no se han impreso**.
  Una vez impresa (ya está en Cocina), solo **Caja** puede anularla: la línea deja de cobrarse pero queda
  registrada como anulada, con quién la anuló y cuándo, para saber qué comida se preparó y no se cobró.

## Stack técnico

- **Frontend**: Next.js (React). Vista de mesero implementada como PWA (offline-first para tolerar
  cortes de WiFi).
- **Backend/DB**: Supabase self-hosted (ya migrado desde Supabase Cloud). Usar:
  - Postgres con Row Level Security (RLS) para separar permisos por rol (mesero solo ve/edita sus mesas
    asignadas; caja ve todas las mesas activas; admin ve todo).
  - Supabase Auth para usuarios (mesero, caja, admin).
  - Supabase Realtime para el estado de mesas en vivo (vista de Caja).
- **Impresión**: desde el navegador en la estación de Caja (`window.print()` con una plantilla CSS de
  ticket), ya que la impresora es normal (hojas), no térmica. No se requiere driver ni servicio de
  impresión aparte.
- **Deploy**: Next.js se despliega en el mismo servidor donde corre el Supabase self-hosted (reverse
  proxy tipo Nginx/Caddy delante de ambos servicios).

## Módulos del sistema

1. Auth & usuarios (login, gestión de cuentas de meseros por el admin)
2. Salones y mesas (CRUD de salones, mesas por salón, estado libre/ocupada)
3. Menú (platos, precios, catálogo de variantes por plato)
4. Pedidos/comandas (creación desde mesero, edición desde caja, estados: pendiente → impreso/enviado →
   en mesa → cerrado)
5. Pagos/cierre de mesa (división de cuentas por platos desde Caja, registrar pago
   efectivo/transferencia/mixto por subcuenta, generar recibo, liberar mesa)
6. Ventas/reportes (vista admin: ventas históricas por día, por salón, etc.)
7. (Futuro, no v1) Análisis de compras/consumo con IA

## Convenciones del proyecto

- Código en TypeScript.
- Seguir la estructura de módulos de arriba como referencia para organizar carpetas (por dominio, no
  solo por tipo de archivo).
- Cualquier regla de negocio nueva o cambio de alcance debe reflejarse primero aquí en CLAUDE.md antes
  de implementarse, para que quede como fuente de verdad del proyecto.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
