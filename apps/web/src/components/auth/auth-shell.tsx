import type { ReactNode } from "react";

export interface AuthShellProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}

/**
 * The frame of the sign-in, sign-up and recovery pages: one narrow column, an
 * editorial heading and the form. Nothing competes with the task.
 */
export function AuthShell({ title, description, children }: AuthShellProps) {
  return (
    <div className="mx-auto w-full max-w-dialog px-4 pt-10 pb-20 sm:px-6 md:pt-16 md:pb-28">
      <h1 className="text-h1-sm md:text-h1">{title}</h1>
      {description ? <p className="mt-3 text-body text-ink-muted">{description}</p> : null}
      <div className="mt-8">{children}</div>
    </div>
  );
}
