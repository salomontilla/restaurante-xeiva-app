import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { setRoomActive, setTableActive } from "@/modules/salones-mesas/actions";
import {
  BulkTablesDialog,
  CreateRoomDialog,
  CreateTableDialog,
  EditRoomDialog,
  EditTableDialog,
} from "@/modules/salones-mesas/components/dialogs";
import { ToggleActive } from "@/modules/salones-mesas/components/toggle-active";
import { listRoomsWithTables } from "@/modules/salones-mesas/queries";

export const metadata = { title: "Salones y mesas · Xeiva" };

export default async function SalonesPage() {
  const rooms = await listRoomsWithTables();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Salones y mesas</h1>
          <p className="text-muted-foreground text-sm">
            Nada se borra: dar de baja oculta el salón o la mesa sin afectar los pedidos
            ya cobrados.
          </p>
        </div>
        <CreateRoomDialog />
      </div>

      {rooms.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            Todavía no hay salones. Crea el primero para poder agregarle mesas.
          </CardContent>
        </Card>
      ) : null}

      {rooms.map((room) => {
        const activeTables = room.tables.filter((t) => t.is_active);
        const inactiveTables = room.tables.filter((t) => !t.is_active);

        return (
          <Card key={room.id} className={room.is_active ? undefined : "opacity-60"}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                {room.name}
                {room.is_active ? (
                  <Badge variant="secondary">{activeTables.length} mesas</Badge>
                ) : (
                  <Badge variant="outline">De baja</Badge>
                )}
              </CardTitle>

              <div className="flex items-center gap-1">
                {room.is_active ? (
                  <>
                    <CreateTableDialog roomId={room.id} />
                    <BulkTablesDialog roomId={room.id} />
                    <EditRoomDialog room={room} />
                  </>
                ) : null}
                <ToggleActive id={room.id} active={room.is_active} action={setRoomActive} />
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-3">
              {activeTables.length === 0 && room.is_active ? (
                <p className="text-muted-foreground text-sm">
                  Este salón no tiene mesas todavía.
                </p>
              ) : null}

              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {activeTables.map((table) => (
                  <li
                    key={table.id}
                    className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="font-medium">{table.label}</span>
                      {table.seats ? (
                        <span className="text-muted-foreground text-xs">
                          {table.seats} puestos
                        </span>
                      ) : null}
                      {table.assigned_waiter_id ? (
                        <Badge variant="secondary" className="text-xs">
                          ocupada
                        </Badge>
                      ) : null}
                    </span>
                    <span className="flex items-center">
                      <EditTableDialog table={table} roomId={room.id} />
                      <ToggleActive
                        id={table.id}
                        active={table.is_active}
                        action={setTableActive}
                        activeLabel="Baja"
                      />
                    </span>
                  </li>
                ))}
              </ul>

              {inactiveTables.length > 0 ? (
                <>
                  <Separator />
                  <details>
                    <summary className="text-muted-foreground cursor-pointer text-sm">
                      {inactiveTables.length} mesa(s) dadas de baja
                    </summary>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {inactiveTables.map((table) => (
                        <li
                          key={table.id}
                          className="text-muted-foreground flex items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2"
                        >
                          <span>{table.label}</span>
                          <ToggleActive
                            id={table.id}
                            active={table.is_active}
                            action={setTableActive}
                          />
                        </li>
                      ))}
                    </ul>
                  </details>
                </>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
