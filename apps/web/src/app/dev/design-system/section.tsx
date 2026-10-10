import type { ReactNode } from "react";

/** A titled block of the design-system page. `id` names the region for the axe tests. */
export function ComponentSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-titulo`} id={id} className="border-t border-line py-12">
      <h2 id={`${id}-titulo`} className="mb-6 text-h2-sm md:text-h2">
        {title}
      </h2>
      <div className="flex flex-col gap-10">{children}</div>
    </section>
  );
}

/** A labelled row of examples inside a section. */
export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-h3">{title}</h3>
      {children}
    </div>
  );
}

export function TokenName({ children }: { children: ReactNode }) {
  return <code className="text-body-sm text-ink-muted">{children}</code>;
}

/** The caption of one example: which state it shows. */
export function StateLabel({ children }: { children: ReactNode }) {
  return <span className="text-body-sm text-ink-muted">{children}</span>;
}
