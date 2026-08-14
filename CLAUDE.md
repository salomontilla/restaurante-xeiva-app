# Contexto del proyecto — Plataforma Web para Restaurante

## Descripción general

Aplicación web para un restaurante (un solo local, no multi-tenant) ubicado en zona rural con WiFi local
de señal intermitente (afectada por viento). Permite a los meseros tomar pedidos desde su celular, que
llegan a Caja para imprimirse y enviarse a Cocina, y da a Caja y Admin control sobre mesas, ventas y menú.

## Roles y flujo principal

1. **Mesero** (celular, PWA): toma el pedido de su mesa asignada. Cada mesero tiene su propio usuario,
   gestionado por el Admin. Normalmente una mesa es atendida por un solo mesero, aunque otro puede ayudar
   a tomar nota en momentos de mucha gente — el sistema NO necesita registrar quién ayudó, solo el mesero
   dueño de la mesa.
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
5. Pagos/cierre de mesa (registrar pago efectivo/transferencia/mixto, generar recibo, liberar mesa)
6. Ventas/reportes (vista admin: ventas históricas por día, por salón, etc.)
7. (Futuro, no v1) Análisis de compras/consumo con IA

## Convenciones del proyecto

- Código en TypeScript.
- Seguir la estructura de módulos de arriba como referencia para organizar carpetas (por dominio, no
  solo por tipo de archivo).
- Cualquier regla de negocio nueva o cambio de alcance debe reflejarse primero aquí en CLAUDE.md antes
  de implementarse, para que quede como fuente de verdad del proyecto.