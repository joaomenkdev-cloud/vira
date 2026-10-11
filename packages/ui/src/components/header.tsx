"use client";

import { Slot } from "radix-ui";
import { useSyncExternalStore, type AnchorHTMLAttributes, type ReactNode } from "react";

import { cn } from "../lib/cn";

function subscribeToScroll(onChange: () => void): () => void {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => {
    window.removeEventListener("scroll", onChange);
  };
}

const hasScrolled = () => window.scrollY > 0;
const notScrolledOnServer = () => false;

export interface HeaderProps {
  /** `HeaderLogo`, then optionally `HeaderNav` and `HeaderActions`. */
  children: ReactNode;
  className?: string;
}

/**
 * The page header (docs/DESIGN.md, 3.11): 64 px on a desktop and 56 px on a phone, the
 * page colour, stuck to the top. Its bottom border only shows once the page scrolls, so
 * the header melts into the page at rest.
 */
export function Header({ children, className }: HeaderProps) {
  const scrolled = useSyncExternalStore(subscribeToScroll, hasScrolled, notScrolledOnServer);

  return (
    <header
      data-scrolled={scrolled ? "" : undefined}
      className={cn(
        "sticky top-0 z-sticky border-b border-transparent bg-bg transition-colors duration-fast data-[scrolled]:border-line",
        className,
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-page items-center gap-6 px-4 sm:px-6 md:h-16 lg:px-8">
        {children}
      </div>
    </header>
  );
}

/** The word mark: "vira" and the one red dot. */
function Wordmark() {
  return (
    <>
      vira
      <span aria-hidden="true" className="mt-1.5 inline-block size-2 rounded-full bg-accent" />
    </>
  );
}

const logoClassName = "inline-flex min-h-11 items-center gap-1 rounded-md text-logo text-ink";

export type HeaderLogoProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> &
  (
    | { asChild?: false; children?: never }
    | {
        /** Draws the word mark inside the single child element (the framework `Link`). */
        asChild: true;
        children: ReactNode;
      }
  );

/** The logo, which leads home. Give it an `aria-label`: the word mark alone is not a name. */
export function HeaderLogo(props: HeaderLogoProps) {
  if (props.asChild) {
    const { asChild: _asChild, children, className, ...rest } = props;
    return (
      <Slot.Root className={cn(logoClassName, className)} {...rest}>
        <Slot.Slottable>{children}</Slot.Slottable>
        <Wordmark />
      </Slot.Root>
    );
  }
  const { asChild: _asChild, className, ...rest } = props;
  return (
    <a className={cn(logoClassName, className)} {...rest}>
      <Wordmark />
    </a>
  );
}

/** The main navigation. Hidden on a phone, where it moves into the avatar menu. */
export function HeaderNav({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <nav aria-label="Principal" className={cn("hidden items-center gap-6 md:flex", className)}>
      {children}
    </nav>
  );
}

const navLinkClassName =
  "inline-flex min-h-11 items-center border-b-2 text-label text-ink transition-colors duration-fast";

export type HeaderNavLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  /** The page you are on: underlined in red and exposed as `aria-current="page"`. */
  current?: boolean;
  asChild?: boolean;
  children: ReactNode;
};

export function HeaderNavLink({
  current = false,
  asChild = false,
  className,
  children,
  ...rest
}: HeaderNavLinkProps) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      aria-current={current ? "page" : undefined}
      className={cn(
        navLinkClassName,
        current ? "border-accent" : "border-transparent hover:border-line-strong",
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/** Sign in, the avatar menu, search: pushed to the right. */
export function HeaderActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("ml-auto flex items-center gap-2", className)}>{children}</div>;
}
