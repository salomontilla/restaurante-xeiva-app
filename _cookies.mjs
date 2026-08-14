// Genera las cookies de sesión EXACTAMENTE como las produciría el navegador,
// usando el mismo @supabase/ssr que usa la app, y las imprime en formato Cookie:.
// Uso: node cookies.mjs <email> <password>
import { createServerClient } from "@supabase/ssr";

const [email, password] = process.argv.slice(2);

let jar = [];

const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const c of list) {
          jar = jar.filter((x) => x.name !== c.name);
          jar.push({ name: c.name, value: c.value });
        }
      },
    },
  },
);

const { error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  console.error("LOGIN_ERROR", error.message);
  process.exit(1);
}

console.log(jar.map((c) => `${c.name}=${c.value}`).join("; "));
