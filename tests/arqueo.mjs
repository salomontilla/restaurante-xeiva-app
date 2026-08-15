/**
 * Prueba del arqueo de caja.
 *
 * Lo que de verdad hay que demostrar aquí es que el arqueo es una FOTO: que anular una
 * línea después de cerrado no le cambie el descuadre. Si eso falla, el arqueo deja de
 * servir como evidencia y toda la feature sobra.
 *
 * Requiere la app corriendo y Supabase local. Uso: pnpm test:arqueo
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
  console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(52)} ${String(actual).padEnd(9)} (esperado ${expected})`);
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

const caja = await signIn("caja@xeiva.local");
const adminUser = await signIn("admin@xeiva.local");
const mesero = await signIn("mesero@xeiva.local");

const now = () => new Date().toISOString();

/** Toma una mesa, pide, imprime y cobra en efectivo. Devuelve el total cobrado. */
async function venderYCobrar(tableLabel, items, method = "efectivo") {
  const { data: mesa } = await admin.from("tables").select("id").eq("label", tableLabel).single();
  const orderId = randomUUID();

  await mesero.db.rpc("claim_table", { p_table_id: mesa.id });
  await mesero.db.rpc("submit_order", {
    p_order: {
      id: orderId,
      table_id: mesa.id,
      client_created_at: now(),
      items: items.map((i) => ({
        id: randomUUID(),
        menu_item_id: i.id,
        qty: i.qty,
        client_created_at: now(),
      })),
    },
  });
  await caja.db.rpc("mark_order_printed", { p_order_id: orderId });

  const { data: check } = await caja.db
    .from("order_checks")
    .select("id, total")
    .eq("order_id", orderId)
    .single();

  await caja.db.rpc("close_check", {
    p_check_id: check.id,
    p_payments: [{ method, amount: Number(check.total) }],
  });

  return { orderId, total: Number(check.total) };
}

// ---------------------------------------------------------------------------
console.log("=== limpieza ===");
{
  const { data: sesiones } = await admin.from("cash_sessions").select("id");
  for (const s of sesiones ?? []) {
    await admin.from("cash_movements").delete().eq("session_id", s.id);
  }
  const { data: pedidos } = await admin.from("orders").select("id");
  for (const o of pedidos ?? []) {
    await admin.from("payments").delete().eq("order_id", o.id);
    await admin.from("order_items").delete().eq("order_id", o.id);
    await admin.from("order_checks").delete().eq("order_id", o.id);
    await admin.from("orders").delete().eq("id", o.id);
  }
  await admin.from("cash_sessions").delete().neq("seq", 0);
  await admin.from("tables").update({ assigned_waiter_id: null }).neq("label", "");
  console.log("  base limpia");
}

// ---------------------------------------------------------------------------
console.log("\n=== abrir la caja ===");
let SESSION_ID;
{
  const { data } = await caja.db.rpc("open_cash_session", { p_opening_float: 100000 });
  check("se abre", data.ok, true);
  SESSION_ID = data.session_id;

  const { data: otra } = await caja.db.rpc("open_cash_session", { p_opening_float: 50000 });
  check("no se puede abrir una segunda", otra.code, "SESSION_ALREADY_OPEN");

  const { data: comoMesero } = await mesero.db.rpc("open_cash_session", { p_opening_float: 1 });
  check("el mesero no puede abrir caja", comoMesero.code, "FORBIDDEN");
}

// ---------------------------------------------------------------------------
console.log("\n=== los cobros se estampan con la caja abierta ===");
{
  const venta = await venderYCobrar("1", [{ id: BANDEJA, qty: 2 }]); // 76.000
  check("se cobró", venta.total, 76000);

  const { data: pagos } = await caja.db
    .from("payments")
    .select("amount, cash_session_id")
    .eq("order_id", venta.orderId);
  check("el pago quedó ligado a la caja", pagos[0].cash_session_id, SESSION_ID);

  const { data } = await caja.db.rpc("get_cash_session", { p_session_id: null });
  check("ventas en efectivo", Number(data.sales_cash), 76000);
  check("esperado en vivo = base + ventas", Number(data.live_expected_cash), 176000);
}

// ---------------------------------------------------------------------------
console.log("\n=== una transferencia no entra al cajón ===");
{
  await venderYCobrar("2", [{ id: GASEOSA, qty: 2 }], "transferencia"); // 10.000

  const { data } = await caja.db.rpc("get_cash_session", { p_session_id: null });
  check("las transferencias se registran aparte", Number(data.sales_transfers), 10000);
  check("el esperado del cajón NO cambia", Number(data.live_expected_cash), 176000);
  check("y se listan para puntear contra el banco", data.transfers.length, 1);
}

// ---------------------------------------------------------------------------
console.log("\n=== retiros e ingresos del cajón ===");
{
  const { data } = await caja.db.rpc("add_cash_movement", {
    p_kind: "retiro",
    p_amount: 30000,
    p_reason: "se le pagó al de las gaseosas",
  });
  check("se registra el retiro", data.ok, true);

  const { data: sinMotivo } = await caja.db.rpc("add_cash_movement", {
    p_kind: "retiro",
    p_amount: 5000,
    p_reason: "   ",
  });
  check("exige motivo", sinMotivo.code, "REASON_REQUIRED");

  const { data: negativo } = await caja.db.rpc("add_cash_movement", {
    p_kind: "retiro",
    p_amount: -100,
    p_reason: "prueba",
  });
  check("rechaza montos inválidos", negativo.code, "INVALID_AMOUNT");

  const { data: sesion } = await caja.db.rpc("get_cash_session", { p_session_id: null });
  check("el esperado baja por el retiro", Number(sesion.live_expected_cash), 146000);
}

// ---------------------------------------------------------------------------
console.log("\n=== cerrar con mesas sin cobrar avisa ===");
{
  const { data: mesa } = await admin.from("tables").select("id").eq("label", "3").single();
  await mesero.db.rpc("claim_table", { p_table_id: mesa.id });
  await mesero.db.rpc("submit_order", {
    p_order: {
      id: randomUUID(),
      table_id: mesa.id,
      client_created_at: now(),
      items: [{ id: randomUUID(), menu_item_id: GASEOSA, qty: 1, client_created_at: now() }],
    },
  });

  const { data } = await caja.db.rpc("close_cash_session", {
    p_session_id: SESSION_ID,
    p_counted_cash: 146000,
  });
  check("avisa que quedan mesas abiertas", data.code, "OPEN_ORDERS");
  check("y dice cuántas", data.open_orders, 1);
}

// ---------------------------------------------------------------------------
console.log("\n=== descuadre: se puede cerrar, pero hay que explicarlo ===");
{
  const { data: sinNota } = await caja.db.rpc("close_cash_session", {
    p_session_id: SESSION_ID,
    p_counted_cash: 140000,
    p_allow_open_orders: true,
  });
  check("sin observación → NOTE_REQUIRED", sinNota.code, "NOTE_REQUIRED");
  check("y dice cuál era el esperado", Number(sinNota.expected_cash), 146000);

  const { data } = await caja.db.rpc("close_cash_session", {
    p_session_id: SESSION_ID,
    p_counted_cash: 140000,
    p_counted_transfers: 10000,
    p_notes: "faltaron 6.000, se revisará mañana",
    p_allow_open_orders: true,
  });
  check("con observación sí cierra", data.ok, true);
  check("registra la diferencia", Number(data.cash_difference), -6000);
  check("y el esperado congelado", Number(data.expected_cash), 146000);
}

// ---------------------------------------------------------------------------
console.log("\n=== EL PUNTO CLAVE: el arqueo cerrado es una foto ===");
{
  const { data: antes } = await caja.db
    .from("cash_sessions")
    .select("expected_cash, cash_difference")
    .eq("id", SESSION_ID)
    .single();

  // Se anula una línea YA COBRADA de la venta de la mesa 1. Si el esperado se
  // recalculara al leer, el descuadre de este arqueo cambiaría solo.
  const { data: items } = await caja.db
    .from("order_items")
    .select("id")
    .not("printed_at", "is", null)
    .is("voided_at", null)
    .limit(1);
  await caja.db.rpc("void_order_item", { p_item_id: items[0].id, p_reason: "prueba" });

  const { data: despues } = await caja.db
    .from("cash_sessions")
    .select("expected_cash, cash_difference")
    .eq("id", SESSION_ID)
    .single();

  check("el esperado NO cambia", Number(despues.expected_cash), Number(antes.expected_cash));
  check("el descuadre NO cambia", Number(despues.cash_difference), Number(antes.cash_difference));
}

// ---------------------------------------------------------------------------
console.log("\n=== cobrar después del cierre no toca el arqueo ===");
{
  const { data: check3 } = await caja.db
    .from("order_checks")
    .select("id, total, order_id")
    .is("paid_at", null)
    .limit(1)
    .single();

  const { data: cobro } = await caja.db.rpc("close_check", {
    p_check_id: check3.id,
    p_payments: [{ method: "efectivo", amount: Number(check3.total) }],
  });
  check("el cobro no se bloquea", cobro.ok, true);
  check("y queda sin caja asociada", cobro.cash_session_id, null);

  const { data: sesion } = await caja.db.rpc("get_cash_session", { p_session_id: SESSION_ID });
  check("el arqueo sigue igual", Number(sesion.session.expected_cash), 146000);
  check("pero se ve el cobro tardío", Number(sesion.late_cash), Number(check3.total));
}

// ---------------------------------------------------------------------------
console.log("\n=== corregir un conteo mal tecleado ===");
{
  const { data: comoCaja } = await caja.db.rpc("amend_cash_session", {
    p_session_id: SESSION_ID,
    p_counted_cash: 146000,
    p_reason: "intento de caja",
  });
  check("Caja no puede corregir", comoCaja.code, "FORBIDDEN");

  const { data: sinMotivo } = await adminUser.db.rpc("amend_cash_session", {
    p_session_id: SESSION_ID,
    p_counted_cash: 146000,
    p_reason: "",
  });
  check("el admin necesita motivo", sinMotivo.code, "REASON_REQUIRED");

  const { data } = await adminUser.db.rpc("amend_cash_session", {
    p_session_id: SESSION_ID,
    p_counted_cash: 146000,
    p_reason: "estaba mal tecleado, eran 146.000",
  });
  check("el admin corrige", data.ok, true);
  check("y ahora cuadra", Number(data.cash_difference), 0);

  const { data: fila } = await adminUser.db
    .from("cash_sessions")
    .select("amended_from, expected_cash")
    .eq("id", SESSION_ID)
    .single();
  check("guarda el valor anterior", Number(fila.amended_from), 140000);
  check("y NO toca el esperado", Number(fila.expected_cash), 146000);

  const { data: otraVez } = await adminUser.db.rpc("amend_cash_session", {
    p_session_id: SESSION_ID,
    p_counted_cash: 999,
    p_reason: "segunda corrección",
  });
  check("solo se corrige una vez", otraVez.code, "ALREADY_AMENDED");
}

// ---------------------------------------------------------------------------
console.log("\n=== el mesero no ve el dinero ===");
{
  const { data: sesiones } = await mesero.db.from("cash_sessions").select("id");
  check("no ve arqueos", sesiones.length, 0);

  const { data: movs } = await mesero.db.from("cash_movements").select("id");
  check("no ve movimientos", movs.length, 0);

  const { data } = await mesero.db.rpc("get_cash_session", { p_session_id: SESSION_ID });
  check("no puede consultarlo", data.code, "FORBIDDEN");
}

// ---------------------------------------------------------------------------
console.log("\n=== la pantalla ===");
{
  const res = await fetch(`${APP}/caja/arqueo`, {
    headers: { cookie: caja.cookie },
    redirect: "manual",
  });
  check("/caja/arqueo", String(res.status), "200");
  checkTruthy("muestra el título", (await res.text()).includes("Arqueo de caja"));

  const meseroRes = await fetch(`${APP}/caja/arqueo`, {
    headers: { cookie: mesero.cookie },
    redirect: "manual",
  });
  const loc = meseroRes.headers.get("location");
  check("el mesero no entra", loc ? new URL(loc, APP).pathname : String(meseroRes.status), "/mesero");
}

console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);
