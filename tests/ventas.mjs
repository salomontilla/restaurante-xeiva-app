/**
 * Prueba de ventas y reportes (Fase 7).
 *
 * Siembra jornadas históricas —domingos pasados— y comprueba que el tablero cuadre.
 * Lo importante aquí no es el gráfico sino que los números sean ciertos: un reporte
 * equivocado es peor que no tener reporte.
 *
 * Requiere la app corriendo y Supabase local. Uso: pnpm test:ventas
 */
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY_SB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const CAJA_ID = "22222222-2222-4222-8222-222222222222";
const MESERO_ID = "33333333-3333-4333-8333-333333333333";
const BANDEJA = { id: "cccccccc-0000-4000-8000-000000000002", name: "Bandeja Paisa", price: 38000 };
const GASEOSA = { id: "cccccccc-0000-4000-8000-000000000006", name: "Gaseosa", price: 5000 };

let fails = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(48)} ${String(actual).padEnd(10)} (esperado ${expected})`);
}

function checkTruthy(label, actual) {
  if (!actual) fails++;
  console.log(`  ${actual ? "✓" : "✗"} ${label}`);
}

const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function signIn(email) {
  let jar = [];
  const ssr = createServerClient(URL_SB, KEY_SB, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const c of list) {
          jar = jar.filter((x) => x.name !== c.name);
          jar.push({ name: c.name, value: c.value });
        }
      },
    },
  });
  const { data, error } = await ssr.auth.signInWithPassword({ email, password: "xeiva123" });
  if (error) throw new Error(`${email}: ${error.message}`);

  const db = createClient(URL_SB, KEY_SB, { auth: { persistSession: false } });
  await db.auth.setSession({ access_token: data.session.access_token, refresh_token: "x" });

  return { cookie: jar.map((c) => `${c.name}=${c.value}`).join("; "), db };
}

/** Los tres domingos anteriores al de hoy, como `YYYY-MM-DD`. */
function domingosPasados(cantidad) {
  const dates = [];
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);

  while (dates.length < cantidad) {
    cursor.setDate(cursor.getDate() - 1);
    if (cursor.getDay() === 0) dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates.reverse(); // de la más antigua a la más reciente
}

/**
 * Crea un pedido ya cobrado en una fecha pasada.
 *
 * Va con service_role e INSERT directo porque `submit_order` sella `opened_at` con
 * `now()` — y aquí hace falta backdatear para que `business_date` caiga en la jornada
 * que se quiere simular. Es una fixture de prueba, no un camino de la aplicación.
 */
async function ventaHistorica({ fecha, tableLabel, lineas, cash, transfer }) {
  const { data: mesa } = await admin
    .from("tables")
    .select("id, label, dining_room_id")
    .eq("label", tableLabel)
    .single();

  const orderId = randomUUID();
  const openedAt = `${fecha}T18:00:00-05:00`;

  await admin.from("orders").insert({
    id: orderId,
    table_id: mesa.id,
    dining_room_id: mesa.dining_room_id,
    table_label: mesa.label,
    waiter_id: MESERO_ID,
    client_created_at: openedAt,
    opened_at: openedAt,
    created_by: MESERO_ID,
  });

  const { data: check } = await admin
    .from("order_checks")
    .insert({ order_id: orderId, seq: 1 })
    .select()
    .single();

  await admin.from("order_items").insert(
    lineas.map((linea) => ({
      id: randomUUID(),
      order_id: orderId,
      check_id: check.id,
      menu_item_id: linea.item.id,
      qty: linea.qty,
      unit_price: linea.item.price,
      item_name: linea.item.name,
      client_created_at: openedAt,
      created_by: MESERO_ID,
      printed_at: openedAt,
    })),
  );

  if (cash > 0) {
    await admin.from("payments").insert({
      order_id: orderId,
      check_id: check.id,
      method: "efectivo",
      amount: cash,
      created_by: CAJA_ID,
    });
  }
  if (transfer > 0) {
    await admin.from("payments").insert({
      order_id: orderId,
      check_id: check.id,
      method: "transferencia",
      amount: transfer,
      created_by: CAJA_ID,
    });
  }

  await admin
    .from("order_checks")
    .update({ paid_at: openedAt, paid_by: CAJA_ID })
    .eq("id", check.id);

  await admin
    .from("orders")
    .update({ status: "cerrado", closed_at: openedAt, closed_by: CAJA_ID })
    .eq("id", orderId);

  return orderId;
}

// ---------------------------------------------------------------------------
console.log("=== limpieza y siembra de jornadas históricas ===");

// Se limpia TODO para que los totales del tablero sean predecibles.
{
  const { data: previos } = await admin.from("orders").select("id");
  for (const o of previos ?? []) {
    await admin.from("payments").delete().eq("order_id", o.id);
    await admin.from("order_items").delete().eq("order_id", o.id);
    await admin.from("order_checks").delete().eq("order_id", o.id);
    await admin.from("orders").delete().eq("id", o.id);
  }
  await admin.from("tables").update({ assigned_waiter_id: null }).neq("label", "");
}

const [J1, J2, J3] = domingosPasados(3);

// J1: 1 pedido de 38.000 en efectivo
await ventaHistorica({ fecha: J1, tableLabel: "1", lineas: [{ item: BANDEJA, qty: 1 }], cash: 38000, transfer: 0 });

// J2: 2 pedidos → 76.000 + 10.000 = 86.000 (mitad efectivo, mitad transferencia)
await ventaHistorica({ fecha: J2, tableLabel: "2", lineas: [{ item: BANDEJA, qty: 2 }], cash: 76000, transfer: 0 });
await ventaHistorica({ fecha: J2, tableLabel: "3", lineas: [{ item: GASEOSA, qty: 2 }], cash: 0, transfer: 10000 });

// J3: 1 pedido de 43.000 mixto
await ventaHistorica({
  fecha: J3,
  tableLabel: "F1",
  lineas: [{ item: BANDEJA, qty: 1 }, { item: GASEOSA, qty: 1 }],
  cash: 20000,
  transfer: 23000,
});

console.log(`  jornadas sembradas: ${J1}, ${J2}, ${J3}`);

const caja = await signIn("caja@xeiva.local");
const adminUser = await signIn("admin@xeiva.local");
const mesero = await signIn("mesero@xeiva.local");

// ---------------------------------------------------------------------------
console.log("\n=== las jornadas existentes ===");
{
  const { data } = await adminUser.db
    .from("v_sales_daily")
    .select("business_date, orders_count, gross_total")
    .order("business_date");

  check("hay 3 jornadas con ventas", data.length, 3);
  check("la primera es J1", data[0].business_date, J1);
  check("J1 vendió 38.000", Number(data[0].gross_total), 38000);
  check("J2 tuvo 2 pedidos", data[1].orders_count, 2);
  check("J2 vendió 86.000", Number(data[1].gross_total), 86000);
  check("J3 vendió 43.000", Number(data[2].gross_total), 43000);
}

// ---------------------------------------------------------------------------
console.log("\n=== sales_summary sobre el rango completo ===");
{
  const { data } = await adminUser.db.rpc("sales_summary", { p_from: J1, p_to: J3 });

  check("total del periodo", Number(data.totals.gross_total), 167000);
  check("pedidos del periodo", data.totals.orders_count, 4);
  check("efectivo", Number(data.totals.cash_total), 134000);
  check("transferencia", Number(data.totals.transfer_total), 33000);
  check("efectivo + transferencia = total", 134000 + 33000, 167000);
  check("3 jornadas en la serie", data.by_day.length, 3);

  const bandeja = data.top_items.find((i) => i.item_name === "Bandeja Paisa");
  check("bandejas vendidas (1+2+1)", Number(bandeja.qty_sold), 4);

  const salones = data.by_dining_room.map((r) => r.dining_room_name).sort();
  check("aparecen los dos salones", salones.join(","), "Frente,Mango");
}

// ---------------------------------------------------------------------------
console.log("\n=== un rango más corto trae menos ===");
{
  const { data } = await adminUser.db.rpc("sales_summary", { p_from: J3, p_to: J3 });
  check("solo la última jornada", data.by_day.length, 1);
  check("total de esa jornada", Number(data.totals.gross_total), 43000);
}

// ---------------------------------------------------------------------------
console.log("\n=== un pedido ABIERTO no cuenta como venta ===");
{
  const { data: mesa } = await admin.from("tables").select("id").eq("label", "5").single();
  const orderId = randomUUID();

  await mesero.db.rpc("claim_table", { p_table_id: mesa.id });
  await mesero.db.rpc("submit_order", {
    p_order: {
      id: orderId,
      table_id: mesa.id,
      client_created_at: new Date().toISOString(),
      items: [
        { id: randomUUID(), menu_item_id: BANDEJA.id, qty: 5, client_created_at: new Date().toISOString() },
      ],
    },
  });

  const { data } = await adminUser.db.rpc("sales_summary", { p_from: J1, p_to: J3 });
  check("el total no cambia", Number(data.totals.gross_total), 167000);

  const hoy = new Date().toISOString().slice(0, 10);
  const { data: hoyData } = await adminUser.db.rpc("sales_summary", { p_from: hoy, p_to: hoy });
  check("hoy no registra ventas todavía", Number(hoyData.totals.gross_total ?? 0), 0);
}

// ---------------------------------------------------------------------------
console.log("\n=== la pantalla ===");
{
  const res = await fetch(`${APP}/admin/ventas?ultimas=3`, {
    headers: { cookie: adminUser.cookie },
    redirect: "manual",
  });
  const html = await res.text();

  check("/admin/ventas", String(res.status), "200");
  checkTruthy("muestra el título", html.includes("Ventas por jornada"));
  checkTruthy("muestra el total del periodo formateado", /167[.\s]?000/.test(html));
  checkTruthy("muestra el reparto de pagos", html.includes("Efectivo") && html.includes("Transferencia"));
  checkTruthy("muestra los platos más vendidos", html.includes("Bandeja Paisa"));
  checkTruthy("incluye la vista de tabla", html.includes("Ver como tabla"));

  const corto = await fetch(`${APP}/admin/ventas?ultimas=1`, {
    headers: { cookie: adminUser.cookie },
    redirect: "manual",
  });
  const cortoHtml = await corto.text();
  checkTruthy("el preset de 1 jornada muestra solo 43.000", /43[.\s]?000/.test(cortoHtml));
  checkTruthy("y ya no el total de 167.000", !/167[.\s]?000/.test(cortoHtml));
}

console.log("\n=== solo el admin ve los reportes ===");
{
  for (const [rol, sesion, destino] of [
    ["caja", caja, "/caja"],
    ["mesero", mesero, "/mesero"],
  ]) {
    const res = await fetch(`${APP}/admin/ventas`, {
      headers: { cookie: sesion.cookie },
      redirect: "manual",
    });
    const loc = res.headers.get("location");
    check(`${rol} es redirigido`, loc ? new URL(loc, APP).pathname : String(res.status), destino);
  }
}

console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);
