"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * El login usa el cliente de NAVEGADOR a propósito, no una Server Action.
 *
 * `createBrowserClient` de @supabase/ssr guarda la sesión en cookies, así que después
 * de entrar el servidor también la ve y los guards de los layouts funcionan. Y como el
 * token queda en el navegador, el mesero puede seguir hablando directo con Postgres
 * aunque el servidor de Next no esté disponible — que es todo el punto del diseño
 * offline (ver docs/architecture.md → Acceso a datos).
 *
 * Tras entrar se navega a `/`, que redirige según el rol.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = getBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      // No se distingue "correo no existe" de "clave incorrecta": no hay razón para
      // ayudar a enumerar usuarios, y para el personal el mensaje útil es el mismo.
      setError(
        authError.message === "Failed to fetch"
          ? "Sin conexión con el servidor. Revisa el WiFi."
          : "Correo o contraseña incorrectos.",
      );
      setPending(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Correo</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 text-base"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12 text-base"
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="h-12 text-base">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
