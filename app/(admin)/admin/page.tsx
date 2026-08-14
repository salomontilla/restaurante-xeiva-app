import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Administración · Xeiva" };

const SECTIONS = [
  {
    href: "/admin/salones",
    title: "Salones y mesas",
    description: "Crear salones y las mesas de cada uno.",
  },
  {
    href: "/admin/menu",
    title: "Carta",
    description: "Platos con precio fijo y el catálogo de variantes de cada uno.",
  },
  {
    href: "/admin/usuarios",
    title: "Meseros",
    description: "Crear y desactivar las cuentas de los meseros.",
  },
  {
    href: "/admin/ventas",
    title: "Ventas",
    description: "Ventas por jornada, por salón y por plato.",
  },
];

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Administración</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="hover:border-foreground/20 h-full transition-colors">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
