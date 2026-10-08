import { type AppConfig, envSchema } from "./config.schema.js";

export interface ConfigIssue {
  readonly variable: string;
  readonly message: string;
}

/**
 * Thrown when the environment is invalid. The message names the variables and
 * the rule they break, never their values: they may hold secrets.
 */
export class ConfigValidationError extends Error {
  constructor(readonly issues: readonly ConfigIssue[]) {
    super(
      `Invalid configuration:\n${issues.map((i) => `  - ${i.variable}: ${i.message}`).join("\n")}`,
    );
    this.name = "ConfigValidationError";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const result = envSchema.safeParse(env, { reportInput: false });
  if (result.success) return result.data;

  throw new ConfigValidationError(
    result.error.issues.map((issue) => ({
      variable: issue.path.map(String).join(".") || "(environment)",
      message: issue.message,
    })),
  );
}
