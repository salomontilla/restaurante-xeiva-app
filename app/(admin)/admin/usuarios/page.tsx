import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setStaffActive } from "@/modules/auth/actions";
import {
  CreateStaffDialog,
  RenameStaffDialog,
  ResetPasswordDialog,
} from "@/modules/auth/components/staff-dialogs";
import { getSessionProfile } from "@/modules/auth/guards";
import { listStaff } from "@/modules/auth/queries";
import { ROLE_LABEL } from "@/modules/auth/types";
import { ToggleActive } from "@/modules/salones-mesas/components/toggle-active";

export const metadata = { title: "Personal · Xeiva" };

export default async function UsuariosPage() {
  const [staff, me] = await Promise.all([listStaff(), getSessionProfile()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Personal</h1>
          <p className="text-muted-foreground text-sm">
            Dar de baja bloquea el acceso al instante, aunque la persona tenga la sesión
            abierta. Las cuentas no se borran: los pedidos que atendieron siguen
            necesitando su nombre.
          </p>
        </div>
        <CreateStaffDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((profile) => {
                const isMe = profile.id === me?.id;

                return (
                  <TableRow key={profile.id} className={profile.is_active ? undefined : "opacity-60"}>
                    <TableCell className="font-medium">
                      {profile.full_name}
                      {isMe ? (
                        <span className="text-muted-foreground ml-2 text-xs">(tú)</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{ROLE_LABEL[profile.role]}</TableCell>
                    <TableCell>
                      {profile.is_active ? (
                        <Badge variant="secondary">Activo</Badge>
                      ) : (
                        <Badge variant="outline">De baja</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <RenameStaffDialog profile={profile} />
                        <ResetPasswordDialog profile={profile} />
                        {/* Nadie puede darse de baja a sí mismo: quedaría el
                            restaurante sin admin y sin forma de recuperarlo. */}
                        {isMe ? null : (
                          <ToggleActive
                            id={profile.id}
                            active={profile.is_active}
                            action={setStaffActive}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
