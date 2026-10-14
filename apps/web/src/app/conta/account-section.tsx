import { useId, type ReactNode } from "react";

export interface AccountSectionProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/** One block of the account page: a heading, a sentence and its form or list. */
export function AccountSection({ title, description, children }: AccountSectionProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-6 py-10 first:pt-0">
      <div className="flex flex-col gap-2">
        <h2 id={titleId} className="text-h2-sm md:text-h2">
          {title}
        </h2>
        {description ? <div className="text-body text-ink-muted">{description}</div> : null}
      </div>
      {children}
    </section>
  );
}
