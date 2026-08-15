/**
 * Prueba de pagos, división de cuentas y cierre de mesa (Fase 6).
 *
 * Es la fase que mueve dinero, así que lo que se comprueba es sobre todo lo que NO debe
 * poder pasar: cobrar un monto que no cuadra, mover platos de una cuenta ya pagada,
 * cobrar dos veces, o que el mesero vea los pagos.
 *
 * Requiere la app corriendo y Supabase local con el seed. Uso: pnpm test:pagos
 */
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY_SB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const BANDEJA = "cccccccc-0000-4000-8000-000000000002"; // 38.000
const GASEOSA = "cccccccc-0000-4000-8000-000000000006"; //  5.000

let fails = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(50)} ${String(actual).padEnd(9)} (esperado ${expected})`);
}

function checkTruthy(label, actual) {
  if (!actual) fails++;
  console.log(`  ${actual ? "✓" : "✗"} ${label}`);
}

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

const caja = await signIn("caja@xeiva.local");
const mesero = await signIn("mesero@xeiva.local");
const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
console.log("=== preparar mesa 4 con un pedido impreso ===");
const { data: mesa } = await admin.from("tables").select("id").eq("label", "4").single();
const TABLE_ID = mesa.id;

{
  const { data: previos } = await admin.from("orders").select("id").eq("table_id", TABLE_ID);
  for (const o of previos ?? []) {
    await admin.from("payments").delete().eq("order_id", o.id);
    await admin.from("order_items").delete().eq("order_id", o.id);
    await admin.from("order_checks").delete().eq("order_id", o.id);
    await admin.from("orders").delete().eq("id", o.id);
  }
  await admin.from("tables").update({ assigned_waiter_id: null }).eq("id", TABLE_ID);
}

const ORDER_ID = randomUUID();
const now = () => new Date().toISOString();

await mesero.db.rpc("claim_table", { p_table_id: TABLE_ID });
await mesero.db.rpc("submit_order", {
  p_order: {
    id: ORDER_ID,
    table_id: TABLE_ID,
    client_created_at: now(),
    items: [
      { id: randomUUID(), menu_item_id: BANDEJA, qty: 1, client_created_at: now() },
      { id: randomUUID(), menu_item_id: BANDEJA, qty: 1, client_created_at: now() },
      { id: randomUUID(), menu_item_id: GASEOSA, qty: 2, client_created_at: now() },
    ],
  },
});
await caja.db.rpc("mark_order_printed", { p_order_id: ORDER_ID });

{
  const { data: order } = await caja.db.from("orders").select("total").eq("id", ORDER_ID).single();
  check("total del pedido (2 bandejas + 2 gaseosas)", Number(order.total), 86000);
}

// ---------------------------------------------------------------------------
console.log("\n=== la pantalla de cobro renderiza ===");
{
  const res = await fetch(`${APP}/caja/mesa/${TABLE_ID}/cerrar`, {
    headers: { cookie: caja.cookie },
    redirect: "manual",
  });
  check("/caja/mesa/[id]/cerrar", String(res.status), "200");

  const meseroRes = await fetch(`${APP}/caja/mesa/${TABLE_ID}/cerrar`, {
    headers: { cookie: mesero.cookie },
    redirect: "manual",
  });
  const loc = meseroRes.headers.get("location");
  check("el mesero no entra", loc ? new URL(loc, APP).pathname : String(meseroRes.status), "/mesero");
}

// ---------------------------------------------------------------------------
console.log("\n=== dividir la cuenta por platos ===");
let CHECK_1;
let CHECK_2;
{
  const { data: items } = await caja.db
    .from("order_items")
    .select("id, item_name, line_total")
    .eq("order_id", ORDER_ID)
    .order("client_created_at");

  const bandejas = items.filter((i) => i.item_name === "Bandeja Paisa");
  const gaseosas = items.filter((i) => i.item_name === "Gaseosa");

  const { data } = await caja.db.rpc("split_order", {
    p_order_id: ORDER_ID,
    p_assignments: [
      { seq: 1, item_ids: [bandejas[0].id] },
      { seq: 2, item_ids: [bandejas[1].id, ...gaseosas.map((g) => g.id)] },
    ],
  });
  check("se divide", data.ok, true);

  const { data: checks } = await caja.db
    .from("order_checks")
    .select("id, seq, total")
    .eq("order_id", ORDER_ID)
    .order("seq");

  check("quedan 2 cuentas", checks.length, 2);
  check("cuenta 1 = una bandeja", Number(checks[0].total), 38000);
  check("cuenta 2 = bandeja + 2 gaseosas", Number(checks[1].total), 48000);
  check("las dos suman el total del pedido", Number(checks[0].total) + Number(checks[1].total), 86000);

  CHECK_1 = checks[0].id;
  CHECK_2 = checks[1].id;
}

// ---------------------------------------------------------------------------
console.log("\n=== no se puede cobrar un monto que no cuadra ===");
{
  const { data } = await caja.db.rpc("close_check", {
    p_check_id: CHECK_1,
    p_payments: [{ method: "efectivo", amount: 30000 }],
  });
  check("de menos → AMOUNT_MISMATCH", data.code, "AMOUNT_MISMATCH");
  check("y dice cuánto era", Number(data.expected), 38000);

  const { data: over } = await caja.db.rpc("close_check", {
    p_check_id: CHECK_1,
    p_payments: [{ method: "efectivo", amount: 50000 }],
  });
  check("de más → AMOUNT_MISMATCH", over.code, "AMOUNT_MISMATCH");
}

// ---------------------------------------------------------------------------
console.log("\n=== cobrar la cuenta 1 con pago MIXTO ===");
{
  const { data } = await caja.db.rpc("close_check", {
    p_check_id: CHECK_1,
    p_payments: [
      { method: "efectivo", amount: 20000, tendered: 50000 },
      { method: "transferencia", amount: 18000, reference: "NEQUI-991" },
    ],
  });

  check("se cobra", data.ok, true);
  check("el pedido NO se cierra todavía", data.order_closed, false);
  check("queda 1 cuenta pendiente", data.checks_remaining, 1);

  const { data: mapa } = await caja.db
    .from("v_table_map")
    .select("is_occupied")
    .eq("table_id", TABLE_ID)
    .single();
  check("la mesa sigue ocupada", mapa.is_occupied, true);
}

// ---------------------------------------------------------------------------
console.log("\n=== una cuenta pagada queda sellada ===");
{
  const { data: items } = await caja.db
    .from("order_items")
    .select("id")
    .eq("check_id", CHECK_1);

  const { data } = await caja.db.rpc("split_order", {
    p_order_id: ORDER_ID,
    p_assignments: [{ seq: 2, item_ids: [items[0].id] }],
  });
  check("no se pueden mover sus platos", data.code, "CHECK_PAID");

  const { data: again } = await caja.db.rpc("close_check", {
    p_check_id: CHECK_1,
    p_payments: [{ method: "efectivo", amount: 38000 }],
  });
  check("no se puede cobrar dos veces", again.code, "CHECK_PAID");
}

// ---------------------------------------------------------------------------
console.log("\n=== el recibo de la cuenta 1 ===");
{
  const { data } = await caja.db.rpc("get_receipt", { p_check_id: CHECK_1 });

  check("trae 1 línea", data.items.length, 1);
  check("trae los 2 pagos del mixto", data.payments.length, 2);
  check("dice que la mesa tiene 2 cuentas", data.checks_total, 2);
  check("total del recibo", Number(data.check.total), 38000);

  const efectivo = data.payments.find((p) => p.method === "efectivo");
  check("calcula el vuelto (50.000 − 20.000)", Number(efectivo.change), 30000);

  const transferencia = data.payments.find((p) => p.method === "transferencia");
  check("guarda la referencia", transferencia.reference, "NEQUI-991");

  const res = await fetch(`${APP}/imprimir/recibo/${CHECK_1}`, {
    headers: { cookie: caja.cookie },
    redirect: "manual",
  });
  check("la pantalla del recibo renderiza", String(res.status), "200");
}

// ---------------------------------------------------------------------------
console.log("\n=== el mesero no ve el dinero ===");
{
  const { data: pagos } = await mesero.db.from("payments").select("id");
  check("no ve ningún pago", pagos.length, 0);

  const { data: recibo } = await mesero.db.rpc("get_receipt", { p_check_id: CHECK_1 });
  check("no puede pedir el recibo", recibo.code, "FORBIDDEN");
}

// ---------------------------------------------------------------------------
console.log("\n=== cobrar la última cuenta cierra la mesa ===");
{
  const { data } = await caja.db.rpc("close_check", {
    p_check_id: CHECK_2,
    p_payments: [{ method: "transferencia", amount: 48000 }],
  });

  check("se cobra", data.ok, true);
  check("el pedido se cierra", data.order_closed, true);
  check("no quedan cuentas", data.checks_remaining, 0);

  const { data: order } = await caja.db
    .from("orders")
    .select("status, closed_at, total")
    .eq("id", ORDER_ID)
    .single();
  check("estado del pedido", order.status, "cerrado");
  checkTruthy("tiene fecha de cierre", order.closed_at !== null);

  const { data: mapa } = await caja.db
    .from("v_table_map")
    .select("is_occupied, assigned_waiter_id")
    .eq("table_id", TABLE_ID)
    .single();
  check("la mesa quedó LIBRE sola", mapa.is_occupied, false);
  check("y sin mesero asignado", mapa.assigned_waiter_id, null);
}

// ---------------------------------------------------------------------------
console.log("\n=== un pedido cerrado no admite más nada ===");
{
  const { data } = await mesero.db.rpc("submit_order", {
    p_order: {
      id: ORDER_ID,
      table_id: TABLE_ID,
      client_created_at: now(),
      items: [{ id: randomUUID(), menu_item_id: GASEOSA, qty: 1, client_created_at: now() }],
    },
  });
  check("el mesero recibe ORDER_CLOSED", data.code, "ORDER_CLOSED");
}

// ---------------------------------------------------------------------------
console.log("\n=== compartir un plato: partir una línea por cantidad ===");
{
  // Mesa nueva para no tocar la ya cerrada.
  const { data: mesa5 } = await admin.from("tables").select("id").eq("label", "5").single();
  const { data: previos } = await admin.from("orders").select("id").eq("table_id", mesa5.id);
  for (const o of previos ?? []) {
    await admin.from("payments").delete().eq("order_id", o.id);
    await admin.from("order_items").delete().eq("order_id", o.id);
    await admin.from("order_checks").delete().eq("order_id", o.id);
    await admin.from("orders").delete().eq("id", o.id);
  }
  await admin.from("tables").update({ assigned_waiter_id: null }).eq("id", mesa5.id);

  const orderId = randomUUID();
  await mesero.db.rpc("claim_table", { p_table_id: mesa5.id });
  await mesero.db.rpc("submit_order", {
    p_order: {
      id: orderId,
      table_id: mesa5.id,
      client_created_at: now(),
      items: [{ id: randomUUID(), menu_item_id: BANDEJA, qty: 2, client_created_at: now() }],
    },
  });

  const { data: before } = await caja.db
    .from("order_items")
    .select("id, qty")
    .eq("order_id", orderId);
  check("empieza con 1 línea de 2 unidades", before[0].qty, 2);

  await caja.db.rpc("split_order_line", { p_item_id: before[0].id, p_qty: 1 });

  const { data: after } = await caja.db
    .from("order_items")
    .select("id, qty, line_total")
    .eq("order_id", orderId);

  check("queda partida en 2 líneas", after.length, 2);
  check("cada una de 1 unidad", after.every((i) => i.qty === 1), true);

  const { data: order } = await caja.db.from("orders").select("total").eq("id", orderId).single();
  check("el total NO cambia al partir", Number(order.total), 76000);
}

console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);
