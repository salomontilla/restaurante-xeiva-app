/**
 * Prueba de la vista de Caja (Fase 5).
 *
 * Cubre tres capas:
 *   1. Que las pantallas rendericen y que el mesero no entre.
 *   2. El flujo de comandas: imprimir, adición que solo trae lo nuevo, anular.
 *   3. Realtime de verdad — abre un WebSocket, provoca un cambio y espera el evento.
 *      Es la única forma de comprobar que la publicación de Postgres está bien puesta;
 *      el SQL puede estar perfecto y el evento no llegar nunca.
 *
 * Requiere la app corriendo y Supabase local con el seed. Uso: pnpm test:caja
 */
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY_SB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const BANDEJA = "cccccccc-0000-4000-8000-000000000002";
const GASEOSA = "cccccccc-0000-4000-8000-000000000006";

let fails = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(48)} ${String(actual).padEnd(8)} (esperado ${expected})`);
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

  return {
    cookie: jar.map((c) => `${c.name}=${c.value}`).join("; "),
    db,
    token: data.session.access_token,
  };
}

async function page(path, cookie) {
  const res = await fetch(APP + path, { headers: { cookie }, redirect: "manual" });
  const location = res.headers.get("location");
  return {
    status: location ? new URL(location, APP).pathname : String(res.status),
    html: res.ok ? await res.text() : "",
  };
}

const caja = await signIn("caja@xeiva.local");
const mesero = await signIn("mesero@xeiva.local");

// ---------------------------------------------------------------------------
console.log("=== limpieza previa (la prueba se puede correr varias veces) ===");
{
  // Se usa service_role solo para la limpieza: borrar pedidos no es una operación que
  // la app permita a nadie, y dejar el pedido anterior abierto haría que la corrida
  // siguiente no creara nada — y sin cambios no hay evento de Realtime que esperar.
  const admin = createClient(URL_SB, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: mesa } = await admin.from("tables").select("id").eq("label", "3").single();
  var TABLE_ID = mesa.id;

  const { data: previos } = await admin.from("orders").select("id").eq("table_id", TABLE_ID);

  for (const o of previos ?? []) {
    // De adentro hacia afuera: los triggers de integridad bloquean el orden inverso.
    await admin.from("payments").delete().eq("order_id", o.id);
    await admin.from("order_items").delete().eq("order_id", o.id);
    await admin.from("order_checks").delete().eq("order_id", o.id);
    await admin.from("orders").delete().eq("id", o.id);
  }
  await admin.from("tables").update({ assigned_waiter_id: null }).eq("id", TABLE_ID);

  console.log(`  mesa 3 = ${TABLE_ID}, ${previos?.length ?? 0} pedido(s) previo(s) eliminados`);
}

// ---------------------------------------------------------------------------
console.log("\n=== las pantallas de Caja renderizan ===");
{
  const mapa = await page("/caja", caja.cookie);
  check("/caja", mapa.status, "200");
  checkTruthy("/caja muestra el título 'Mesas'", mapa.html.includes("Mesas"));

  const detalle = await page(`/caja/mesa/${TABLE_ID}`, caja.cookie);
  check("/caja/mesa/[id]", detalle.status, "200");
}

console.log("\n=== el mesero no entra a Caja ===");
{
  const mapa = await page("/caja", mesero.cookie);
  check("/caja como mesero", mapa.status, "/mesero");
}

// ---------------------------------------------------------------------------
console.log("\n=== Realtime: el evento llega de verdad ===");
{
  const rt = createClient(URL_SB, KEY_SB, { auth: { persistSession: false } });

  // `setAuth` es asíncrono y hay que esperarlo: sin el token, Realtime rechaza la
  // suscripción a `postgres_changes` porque no puede evaluar RLS.
  await rt.realtime.setAuth(caja.token);

  let channel;
  let onEvent;
  let onSubscribed;

  const gotEvent = new Promise((resolve) => {
    onEvent = resolve;
    setTimeout(() => resolve(false), 15000);
  });

  // Se espera el estado SUBSCRIBED en vez de dormir un rato fijo: con la máquina
  // ocupada, un `sleep` corto provoca falsos negativos: el cambio ocurre antes de que
  // el canal esté escuchando y el evento no le llega a nadie.
  const subscribed = new Promise((resolve) => {
    onSubscribed = resolve;
    setTimeout(() => resolve(false), 15000);
  });

  channel = rt
    .channel("prueba-caja")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
      onEvent(true);
      void rt.removeChannel(channel);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onSubscribed(true);
    });

  checkTruthy("el canal se suscribe", await subscribed);

  await mesero.db.rpc("claim_table", { p_table_id: TABLE_ID });
  var ORDER_ID = randomUUID();
  await mesero.db.rpc("submit_order", {
    p_order: {
      id: ORDER_ID,
      table_id: TABLE_ID,
      client_created_at: new Date().toISOString(),
      items: [
        { id: randomUUID(), menu_item_id: BANDEJA, qty: 2, client_created_at: new Date().toISOString() },
        { id: randomUUID(), menu_item_id: GASEOSA, qty: 1, client_created_at: new Date().toISOString() },
      ],
    },
  });

  checkTruthy("Caja recibe el evento de `orders` por WebSocket", await gotEvent);
}

// ---------------------------------------------------------------------------
console.log("\n=== el mapa refleja la mesa ocupada ===");
{
  const { data } = await caja.db
    .from("v_table_map")
    .select("is_occupied, has_unprinted_items, open_order_total, checks_count")
    .eq("table_id", TABLE_ID)
    .single();

  check("mesa ocupada", data.is_occupied, true);
  check("tiene líneas sin imprimir", data.has_unprinted_items, true);
  check("total (2 bandejas + 1 gaseosa)", Number(data.open_order_total), 81000);
  check("una sola cuenta", data.checks_count, 1);
}

// ---------------------------------------------------------------------------
console.log("\n=== comanda e impresión ===");
{
  const { data: ticket } = await caja.db.rpc("get_order_ticket", {
    p_order_id: ORDER_ID,
    p_only_unprinted: true,
  });
  check("la comanda trae 2 líneas", ticket.items.length, 2);
  check("no es adición todavía", ticket.is_addition, false);
  checkTruthy("trae el nombre del mesero", ticket.waiter === "Mesero de prueba");

  const { data: printed } = await caja.db.rpc("mark_order_printed", { p_order_id: ORDER_ID });
  check("marca 2 líneas como impresas", printed.printed_items, 2);

  const { data: mapa } = await caja.db
    .from("v_table_map")
    .select("has_unprinted_items")
    .eq("table_id", TABLE_ID)
    .single();
  check("ya no queda nada por imprimir", mapa.has_unprinted_items, false);
}

// ---------------------------------------------------------------------------
console.log("\n=== adición: el segundo papel trae SOLO lo nuevo ===");
{
  await mesero.db.rpc("submit_order", {
    p_order: {
      id: ORDER_ID,
      table_id: TABLE_ID,
      client_created_at: new Date().toISOString(),
      items: [
        { id: randomUUID(), menu_item_id: GASEOSA, qty: 2, client_created_at: new Date().toISOString() },
      ],
    },
  });

  const { data: ticket } = await caja.db.rpc("get_order_ticket", {
    p_order_id: ORDER_ID,
    p_only_unprinted: true,
  });

  check("la adición trae 1 sola línea", ticket.items.length, 1);
  check("y es la gaseosa", ticket.items[0].item_name, "Gaseosa");
  check("va marcada como adición", ticket.is_addition, true);

  const { data: completo } = await caja.db.rpc("get_order_ticket", {
    p_order_id: ORDER_ID,
    p_only_unprinted: false,
  });
  check("la reimpresión completa trae las 3 líneas", completo.items.length, 3);
}

// ---------------------------------------------------------------------------
console.log("\n=== Caja agrega platos con el mismo submit_order ===");
{
  const { data } = await caja.db.rpc("submit_order", {
    p_order: {
      id: ORDER_ID,
      table_id: TABLE_ID,
      client_created_at: new Date().toISOString(),
      items: [
        { id: randomUUID(), menu_item_id: BANDEJA, qty: 1, client_created_at: new Date().toISOString() },
      ],
    },
  });
  check("Caja puede agregar a una mesa que no es suya", data.ok, true);
  check("total actualizado", Number(data.order.total), 129000);
}

// ---------------------------------------------------------------------------
console.log("\n=== anular una línea ya impresa ===");
{
  const { data: items } = await caja.db
    .from("order_items")
    .select("id, item_name, line_total, printed_at")
    .eq("order_id", ORDER_ID)
    .not("printed_at", "is", null)
    .is("voided_at", null);

  const target = items[0];
  const { data: result } = await caja.db.rpc("void_order_item", {
    p_item_id: target.id,
    p_reason: "el cliente se arrepintió",
  });
  check("se anula", result.ok, true);

  const { data: order } = await caja.db.from("orders").select("total").eq("id", ORDER_ID).single();
  check(
    "el total baja por el valor de la línea",
    Number(order.total),
    129000 - Number(target.line_total),
  );

  // Sigue existiendo: la comida se preparó y eso queda registrado.
  const { data: still } = await caja.db
    .from("order_items")
    .select("id, voided_at, void_reason")
    .eq("id", target.id)
    .single();
  checkTruthy("la línea anulada NO se borra, queda con motivo", still.void_reason !== null);
}

// ---------------------------------------------------------------------------
console.log("\n=== el mesero no puede anular lo impreso ===");
{
  const { data: items } = await mesero.db
    .from("order_items")
    .select("id")
    .eq("order_id", ORDER_ID)
    .not("printed_at", "is", null)
    .is("voided_at", null)
    .limit(1);

  const { data } = await mesero.db.rpc("void_order_item", { p_item_id: items[0].id });
  check("el mesero recibe FORBIDDEN", data.code, "FORBIDDEN");
}

// ---------------------------------------------------------------------------
console.log("\n=== notas por línea ===");
{
  // La nota viaja en el payload de submit_order, igual que la manda el celular.
  const itemId = randomUUID();
  await caja.db.rpc("submit_order", {
    p_order: {
      id: ORDER_ID,
      table_id: TABLE_ID,
      client_created_at: new Date().toISOString(),
      items: [
        {
          id: itemId,
          menu_item_id: BANDEJA,
          qty: 1,
          note: "sin cebolla",
          client_created_at: new Date().toISOString(),
        },
      ],
    },
  });

  const { data: creada } = await caja.db
    .from("order_items")
    .select("note, printed_at")
    .eq("id", itemId)
    .single();
  check("la nota llega en el pedido", creada.note, "sin cebolla");

  // Mientras no se imprima, mesero y Caja pueden cambiarla.
  await caja.db.from("order_items").update({ note: "sin cebolla y sin sal" }).eq("id", itemId);
  const { data: editada } = await caja.db
    .from("order_items")
    .select("note")
    .eq("id", itemId)
    .single();
  check("se puede cambiar antes de imprimir", editada.note, "sin cebolla y sin sal");

  // Tope de la base: la comanda es de ancho fijo.
  const { error: larga } = await caja.db
    .from("order_items")
    .update({ note: "x".repeat(200) })
    .eq("id", itemId);
  checkTruthy("rechaza notas de más de 120 caracteres", larga !== null);

  const { error: vacia } = await caja.db
    .from("order_items")
    .update({ note: "   " })
    .eq("id", itemId);
  checkTruthy("rechaza la nota vacía (debe ser null)", vacia !== null);

  // La comanda la lleva destacada.
  const { data: ticket } = await caja.db.rpc("get_order_ticket", {
    p_order_id: ORDER_ID,
    p_only_unprinted: true,
  });
  const conNota = ticket.items.find((i) => i.id === itemId);
  check("la comanda lleva la nota", conNota.note, "sin cebolla y sin sal");

  // Una vez impresa, queda congelada: cambiarla no cambiaría el papel que ya tiene
  // el cocinero en la mano.
  await caja.db.rpc("mark_order_printed", { p_order_id: ORDER_ID });
  await caja.db.from("order_items").update({ note: "con cebolla" }).eq("id", itemId);

  const { data: despues } = await caja.db
    .from("order_items")
    .select("note")
    .eq("id", itemId)
    .single();
  check("impresa, la nota ya no se puede cambiar", despues.note, "sin cebolla y sin sal");

  const { data: comoMesero } = await mesero.db
    .from("order_items")
    .select("note")
    .eq("id", itemId)
    .single();
  check("y el mesero la ve igual", comoMesero.note, "sin cebolla y sin sal");
}

console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);
