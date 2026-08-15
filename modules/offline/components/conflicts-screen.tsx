"use client";

import { useLiveQuery } from "dexie-react-hooks";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { db, type OutboxOp } from "../db";
import { discardOp, retargetOp } from "../outbox";
import { requestFlush } from "../sync-engine";

/**
 * Envíos que el servidor rechazó por una razón de negocio.
 *
 * Reintentar no cambiaría la respuesta, así que la decisión es de una persona. Lo que
 * NO puede pasar es que un pedido desaparezca en silencio: por eso el badge del
 * encabezado los cuenta en rojo hasta que alguien los resuelva.
 */

const EXPLANATIONS: Record<string, { title: string; detail: string }> = {
  TABLE_ALREADY_OPEN: {
    title: "La mesa ya tenía otro pedido abierto",
    detail:
      "Mientras estabas sin señal, alguien más abrió un pedido en esta mesa. Puedes pasar tus platos a ese pedido.",
  },
  ORDER_CLOSED: {
    title: "La mesa ya se cobró",
    detail:
      "Caja cerró y cobró esta mesa antes de que llegara tu envío. Si los platos se sirvieron, avísale a Caja para que los agregue.",
  },
  FORBIDDEN: {
    title: "Ya no es tu mesa",
    detail: "La mesa quedó asignada a otra persona. Avísale para que agregue estos platos.",
  },
  ALL_CHECKS_PAID: {
    title: "Todas las cuentas ya se pagaron",
    detail: "No se pueden agregar más platos a esta mesa.",
  },
  SERVER_ERROR: {
    title: "El servidor rechazó el envío",
    detail: "Puedes reintentar. Si vuelve a fallar, avísale al administrador.",
  },
};

export function ConflictsScreen({ onBack }: { onBack: () => void }) {
  const conflicts = useLiveQuery(
    () => db.outbox.where("status").equals("conflict").sortBy("createdAt"),
    [],
    undefined,
  );

  if (conflicts === undefined) return null;

  if (conflicts.length === 0) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-sm">No hay envíos sin resolver.</p>
        <Button variant="outline" className="self-start" onClick={onBack}>
          Volver
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Envíos sin resolver</h1>

      {conflicts.map((op) => (
        <ConflictCard key={op.opId} op={op} />
      ))}
    </div>
  );
}

function ConflictCard({ op }: { op: OutboxOp }) {
  const explanation = EXPLANATIONS[op.conflictCode ?? ""] ?? {
    title: "No se pudo enviar",
    detail: op.lastError ?? "Ocurrió un problema al enviar estos platos.",
  };

  // En el caso "la mesa ya tenía otro pedido", el motor guardó el id de ESE pedido para
  // poder mover las líneas sin volver a preguntarle al servidor. Las líneas conservan su
  // uuid, así que reenviarlas sigue siendo idempotente.
  const mergeTargetId = op.conflictCode === "TABLE_ALREADY_OPEN" ? op.lastError : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Mesa {op.tableLabel} · {explanation.title}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">{explanation.detail}</p>

        <ul className="text-sm">
          {op.payload.items.map((item) => (
            <li key={item.id}>
              {item.qty} × plato pendiente de enviar
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          {mergeTargetId ? (
            <Button
              className="h-11"
              onClick={async () => {
                await retargetOp(op.opId, mergeTargetId);
                requestFlush();
              }}
            >
              Pasar al pedido de esa mesa
            </Button>
          ) : (
            <Button
              className="h-11"
              onClick={async () => {
                await db.outbox.update(op.opId, {
                  status: "pending",
                  conflictCode: null,
                  lastError: null,
                });
                requestFlush();
              }}
            >
              Reintentar
            </Button>
          )}

          <Button variant="outline" className="h-11" onClick={() => void discardOp(op.opId)}>
            Descartar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
