"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from "@vira/ui";
import { CalendarDays, LogOut, Ticket, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { logout } from "@/lib/api/auth";
import { useSession } from "@/lib/session/session-provider";

/** Pages where an "Entrar" link would only lead back to where the person already is. */
const AUTH_PATHS = new Set([
  "/entrar",
  "/cadastro",
  "/esqueci-a-senha",
  "/redefinir-senha",
  "/verificar-email",
  "/confirmar-email",
]);

/** Up to two initials of the name, for the avatar. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase() || "?";
}

/**
 * The right side of the header (docs/DESIGN.md, 3.11): "Entrar" for a visitor, the
 * avatar with its menu for someone signed in.
 */
export function AccountMenu() {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { state } = session;

  if (state.status === "loading") {
    return <Skeleton className="size-11 rounded-full" />;
  }

  if (state.status !== "authenticated") {
    if (AUTH_PATHS.has(pathname)) return null;
    const href = pathname === "/" ? "/entrar" : `/entrar?next=${encodeURIComponent(pathname)}`;
    return (
      <Button asChild variant="secondary" size="sm">
        <Link href={href}>Entrar</Link>
      </Button>
    );
  }

  const { account } = state;

  async function signOut() {
    try {
      await logout();
    } finally {
      // Whatever the API answered, this browser forgets the session.
      session.signedOut();
      router.replace("/");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Conta de ${account.name}`}
        className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-9 items-center justify-center rounded-full bg-ink text-label text-surface"
        >
          {initialsOf(account.name)}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{account.name}</DropdownMenuLabel>
        <DropdownMenuItem
          icon={Ticket}
          onSelect={() => {
            router.push("/ingressos");
          }}
        >
          Meus ingressos
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={UserRound}
          onSelect={() => {
            router.push("/conta");
          }}
        >
          Minha conta
        </DropdownMenuItem>
        {account.organizer ? (
          <DropdownMenuItem
            icon={CalendarDays}
            onSelect={() => {
              router.push("/painel");
            }}
          >
            Meus eventos
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={LogOut}
          onSelect={() => {
            void signOut();
          }}
        >
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
