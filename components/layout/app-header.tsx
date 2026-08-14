import Link from "next/link";

import { LogoutButton } from "@/modules/auth/components/logout-button";
import { ROLE_LABEL, type Profile } from "@/modules/auth/types";

type NavItem = { href: string; label: string };

/**
 * Encabezado común a las tres vistas. Es un Server Component: recibe el perfil que el
 * layout ya resolvió con `requireRole`, sin volver a consultarlo.
 */
export function AppHeader({
  profile,
  nav = [],
}: {
  profile: Profile;
  nav?: NavItem[];
}) {
  return (
    <header className="bg-background sticky top-0 z-10 border-b">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <span className="font-semibold">Xeiva</span>

        {nav.length > 0 ? (
          <nav className="flex items-center gap-1 overflow-x-auto">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hover:bg-accent rounded-md px-3 py-1.5 text-sm whitespace-nowrap"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-muted-foreground hidden text-sm sm:inline">
            {profile.full_name} · {ROLE_LABEL[profile.role]}
          </span>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
