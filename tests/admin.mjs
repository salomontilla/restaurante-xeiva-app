/**
 * Prueba de la administración (Fase 3).
 *
 * Dos capas:
 *   1. Que las pantallas de admin rendericen sin reventar y que solo el admin entre.
 *      Es lo que más se rompe en Server Components: un `select` mal escrito o una
 *      política que niega una lectura solo se nota al renderizar.
 *   2. Que las operaciones que hacen las Server Actions funcionen bajo RLS con la
 *      sesión del admin: crear, renombrar, dar de baja, y los constraints de nombre
 *      repetido.
 *
 * Requiere `pnpm dev` corriendo y el Supabase local con el seed. Uso:
 *
 *     pnpm test:admin
 */
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY_SB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let fails = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(46)} ${String(actual).padEnd(10)} (esperado ${expected})`);
}

function checkTruthy(label, actual) {
  if (!actual) fails++;
  console.log(`  ${actual ? "✓" : "✗"} ${label}`);
}

async function signIn(email, password) {
  let jar = [];
  const supabase = createServerClient(URL_SB, KEY_SB, {
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
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return {
    cookie: jar.map((c) => `${c.name}=${c.value}`).join("; "),
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

// ---------------------------------------------------------------------------
const admin = await signIn("admin@xeiva.local", "xeiva123");
const caja = await signIn("caja@xeiva.local", "xeiva123");

console.log("=== las pantallas de admin renderizan ===");
const PAGES = [
  ["/admin", "Administración"],
  ["/admin/salones", "Salones y mesas"],
  ["/admin/menu", "Carta"],
  ["/admin/usuarios", "Personal"],
  ["/admin/ventas", "Ventas"],
];
for (const [path, expectedText] of PAGES) {
  const { status, html } = await page(path, admin.cookie);
  check(path, status, "200");
  checkTruthy(`${path} muestra "${expectedText}"`, html.includes(expectedText));
}

console.log("\n=== los datos del seed aparecen en pantalla ===");
{
  const { html } = await page("/admin/salones", admin.cookie);
  checkTruthy("salones muestra el salón Mango", html.includes("Mango"));
  checkTruthy("salones muestra el salón Frente", html.includes("Frente"));
}
{
  const { html } = await page("/admin/menu", admin.cookie);
  checkTruthy("carta muestra Bandeja Paisa", html.includes("Bandeja Paisa"));
  checkTruthy("carta muestra la variante Media porción", html.includes("Media porci"));
  checkTruthy("carta muestra el precio formateado en COP", /\$\s?38[.\s]?000/.test(html));
}
{
  const { html } = await page("/admin/usuarios", admin.cookie);
  checkTruthy("personal muestra al mesero del seed", html.includes("Mesero de prueba"));
}

console.log("\n=== caja no entra a la administración ===");
for (const [path] of PAGES) {
  const { status } = await page(path, caja.cookie);
  check(path, status, "/caja");
}

// ---------------------------------------------------------------------------
// Operaciones bajo RLS con la sesión del admin (lo que hacen las Server Actions).
// ---------------------------------------------------------------------------
console.log("\n=== operaciones del admin bajo RLS ===");

const db = createClient(URL_SB, KEY_SB, { auth: { persistSession: false } });
await db.auth.setSession({
  access_token: admin.token,
  refresh_token: "x",
});

const suffix = Date.now();

// Salón
const { data: room, error: roomError } = await db
  .from("dining_rooms")
  .insert({ name: `Prueba ${suffix}`, sort_order: 99 })
  .select()
  .single();
checkTruthy(`crear salón (${roomError?.message ?? "ok"})`, !!room);

// Nombre repetido entre activos: el índice único parcial debe rechazarlo.
const { error: dupError } = await db.from("dining_rooms").insert({ name: `Prueba ${suffix}` });
checkTruthy("salón con nombre repetido es rechazado", !!dupError);

// Mesas en bloque
const rows = [1, 2, 3].map((n) => ({
  dining_room_id: room.id,
  label: `P${n}`,
  seats: 4,
  sort_order: n,
}));
const { data: tables, error: tablesError } = await db.from("tables").insert(rows).select();
check(`crear 3 mesas (${tablesError?.message ?? "ok"})`, tables?.length ?? 0, 3);

// Dar de baja el salón debe arrastrar sus mesas (lo hace `setRoomActive`).
await db.from("dining_rooms").update({ is_active: false }).eq("id", room.id);
await db.from("tables").update({ is_active: false }).eq("dining_room_id", room.id);
const { count: stillActive } = await db
  .from("tables")
  .select("id", { count: "exact", head: true })
  .eq("dining_room_id", room.id)
  .eq("is_active", true);
check("al dar de baja el salón no quedan mesas activas", stillActive ?? 0, 0);

// El nombre se puede reciclar una vez el salón está de baja.
const { error: recycleError } = await db.from("dining_rooms").insert({ name: `Prueba ${suffix}` });
checkTruthy("el nombre se puede reutilizar tras dar de baja", !recycleError);

// Plato + variante
const { data: item, error: itemError } = await db
  .from("menu_items")
  .insert({ name: `Plato ${suffix}`, base_price: 25000 })
  .select()
  .single();
checkTruthy(`crear plato (${itemError?.message ?? "ok"})`, !!item);

const { error: variantError } = await db
  .from("menu_item_variants")
  .insert({ menu_item_id: item.id, name: "Media porción", price: 15000 });
checkTruthy(`crear variante (${variantError?.message ?? "ok"})`, !variantError);

// Una variante más barata no puede quedar huérfana de su plato: la FK compuesta de
// `order_items` depende de que la variante pertenezca al plato pedido.
const { data: variants } = await db
  .from("menu_item_variants")
  .select("id, name, price")
  .eq("menu_item_id", item.id);
check("el plato quedó con 1 variante", variants?.length ?? 0, 1);

// Limpieza: dar de baja lo creado (nunca borrar).
await db.from("menu_items").update({ is_active: false }).eq("id", item.id);
await db.from("dining_rooms").update({ is_active: false }).ilike("name", `Prueba ${suffix}`);

console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);
