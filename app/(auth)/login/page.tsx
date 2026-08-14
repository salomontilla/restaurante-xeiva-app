import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/modules/auth/components/login-form";
import { getSessionProfile } from "@/modules/auth/guards";
import { HOME_BY_ROLE } from "@/modules/auth/types";

export const metadata = { title: "Entrar · Xeiva" };

export default async function LoginPage() {
  // Si ya hay sesión, no tiene sentido mostrar el login.
  const profile = await getSessionProfile();
  if (profile) redirect(HOME_BY_ROLE[profile.role]);

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Xeiva</CardTitle>
          <CardDescription>Entra con tu cuenta del restaurante</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
