import { ArqueoPanel } from "@/modules/arqueo/components/arqueo-panel";

export const metadata = { title: "Arqueo · Caja" };

export default function ArqueoPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Arqueo de caja</h1>
        <p className="text-muted-foreground text-sm">
          Abre la caja con la base al empezar y cuádrala al terminar la jornada.
        </p>
      </div>

      <ArqueoPanel />
    </div>
  );
}
