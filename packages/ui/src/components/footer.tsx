import { Slot } from "radix-ui";
import { Children, type AnchorHTMLAttributes, type ReactNode } from "react";

import { cn } from "../lib/cn";

/**
 * The page footer (docs/DESIGN.md, 3.11): quiet text in `ink-muted` with at most a line
 * of links. Fill it only with what exists: links to pages that are not there yet do
 * not belong.
 */
export function Footer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer className={cn("border-t border-line", className)}>
      <div className="mx-auto flex w-full max-w-page flex-col gap-2 px-4 py-6 text-body-sm text-ink-muted sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        {children}
      </div>
    </footer>
  );
}

export function FooterNotice({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={className}>{children}</p>;
}

export function FooterLinks({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-6", className)}>
      {Children.toArray(children).map((child, index) => (
        <li key={index}>{child}</li>
      ))}
    </ul>
  );
}

export type FooterLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  asChild?: boolean;
  children: ReactNode;
};

/** A link with a 44 px target. It is always underlined: inside a sentence, colour is not enough. */
export function FooterLink({ asChild = false, className, children, ...rest }: FooterLinkProps) {
  const Comp = asChild ? Slot.Root : "a";
  return (
    <Comp
      className={cn(
        "inline-flex min-h-11 items-center rounded-sm text-ink underline underline-offset-4 hover:text-accent-ink",
        className,
      )}
      {...rest}
    >
      {children}
    </Comp>
  );
}
