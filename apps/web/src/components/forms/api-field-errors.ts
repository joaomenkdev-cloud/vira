import { ApiError } from "@/lib/api/errors";

/** Field errors the API reports by path (`password`), kept to the fields this form has. */
export function apiFieldErrors<F extends string>(
  error: unknown,
  fields: readonly F[],
): Partial<Record<F, string>> {
  if (!(error instanceof ApiError)) return {};
  const found: Partial<Record<F, string>> = {};
  for (const { path } of error.fieldErrors) {
    const field = fields.find((name) => name === path);
    if (field === undefined || found[field] !== undefined) continue;
    found[field] =
      error.code === "breached-password"
        ? "Esta senha apareceu em vazamentos de dados conhecidos. Escolha outra."
        : "Confira este campo.";
  }
  return found;
}
