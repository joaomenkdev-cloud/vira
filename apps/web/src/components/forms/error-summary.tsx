import { Alert } from "@vira/ui";

export interface ErrorSummaryProps<F extends string> {
  errors: Partial<Record<F, string>>;
  /** The order of the fields on screen. */
  fields: readonly F[];
  idOf: (field: F) => string;
}

/**
 * The summary on top of a form that failed validation (docs/DESIGN.md, 3.2): each
 * error links to its field. The focus goes to the first invalid field, so the summary
 * repeats what the field already says, for whoever looks at the top first.
 */
export function ErrorSummary<F extends string>({ errors, fields, idOf }: ErrorSummaryProps<F>) {
  const invalid = fields.filter((field) => errors[field] !== undefined);
  if (invalid.length === 0) return null;

  return (
    <Alert
      variant="danger"
      title={invalid.length === 1 ? "Confira 1 campo" : `Confira ${String(invalid.length)} campos`}
    >
      <ul className="flex flex-col gap-1">
        {invalid.map((field) => (
          <li key={field}>
            <a href={`#${idOf(field)}`} className="underline underline-offset-4">
              {errors[field]}
            </a>
          </li>
        ))}
      </ul>
    </Alert>
  );
}
