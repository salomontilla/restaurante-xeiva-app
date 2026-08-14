/**
 * Prueba de extremo a extremo de la autenticación y los guards por rol (Fase 2).
 *
 * Inicia sesión con @supabase/ssr —la MISMA librería que usa la app— para producir
 * las cookies que produciría el navegador, y con ellas pide cada ruta protegida.
 * No hace falta un navegador: lo que se está probando es el traspaso de sesión del
 * cliente a los guards del servidor, que ocurre por cookies.
 *
 * Requiere la app corriendo (`pnpm dev`) y el Supabase local arriba, con el seed
 * cargado. Uso:
 *
 *     pnpm test:auth
 */
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const APP = process.env.APP_URL ?? "http://localhost:3000";
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY_SB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const KEY_ADMIN = process.env.SUPABASE_SERVICE_ROLE_KEY;

const MESERO_ID = "33333333-3333-4333-8333-333333333333";

if (!URL_SB || !KEY_SB) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

let fails = 0;

function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(34)} ${actual.padEnd(8)} (esperado ${expected})`);
}

/** Cookies de sesión tal como las dejaría el navegador tras el login. */
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
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return jar.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** Devuelve el path de destino, o el status si no hubo redirección. */
async function visit(path, cookie) {
  const res = await fetch(APP + path, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  const location = res.headers.get("location");
  return location ? new URL(location, APP).pathname : String(res.status);
}

const PATHS = ["/", "/mesero", "/caja", "/admin", "/login"];

// Un rol que entra donde no le corresponde va a SU pantalla, no a un 403.
const EXPECTED = {
  mesero: { "/": "/mesero", "/mesero": "200", "/caja": "/mesero", "/admin": "/mesero", "/login": "/mesero" },
  caja: { "/": "/caja", "/mesero": "200", "/caja": "200", "/admin": "/caja", "/login": "/caja" },
  admin: { "/": "/admin", "/mesero": "200", "/caja": "200", "/admin": "200", "/login": "/admin" },
};

for (const role of ["mesero", "caja", "admin"]) {
  console.log(`\n=== ${role} ===`);
  const cookie = await signIn(`${role}@xeiva.local`, "xeiva123");
  for (const path of PATHS) {
    check(path, await visit(path, cookie), EXPECTED[role][path]);
  }
}

console.log("\n=== sin sesión (debe fallar cerrado) ===");
for (const path of ["/", "/mesero", "/caja", "/admin"]) {
  check(path, await visit(path), "/login");
}

// La afirmación fuerte del diseño: el token del mesero dura 8 horas, pero desactivarlo
// surte efecto de inmediato porque el rol se resuelve contra `profiles`, no contra un
// claim del JWT. Ver docs/architecture.md → Seguridad.
if (KEY_ADMIN) {
  console.log("\n=== revocación inmediata (con el token todavía vigente) ===");
  const cookie = await signIn("mesero@xeiva.local", "xeiva123");
  const admin = createClient(URL_SB, KEY_ADMIN, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  check("activo", await visit("/mesero", cookie), "200");

  await admin.from("profiles").update({ is_active: false }).eq("id", MESERO_ID);
  check("desactivado, mismo token", await visit("/mesero", cookie), "/login");

  await admin.from("profiles").update({ is_active: true }).eq("id", MESERO_ID);
  check("reactivado", await visit("/mesero", cookie), "200");
} else {
  console.log("\n(se omite la prueba de revocación: falta SUPABASE_SERVICE_ROLE_KEY)");
}

console.log(fails === 0 ? "\nTODO OK" : `\n${fails} FALLOS`);
process.exit(fails === 0 ? 0 : 1);
