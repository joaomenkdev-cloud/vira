import { Inject, Injectable } from "@nestjs/common";
import type { DependencyStatus, Readiness } from "@vira/shared";

/** A dependency the API needs to serve traffic (database, Redis...). */
export interface DependencyCheck {
  readonly name: string;
  /** Resolves when the dependency is reachable; rejects otherwise. */
  ping(): Promise<void>;
}

export const DEPENDENCY_CHECKS = Symbol("DEPENDENCY_CHECKS");

export const READINESS_TIMEOUT_MS = 2_000;

async function probe(check: DependencyCheck, timeoutMs: number): Promise<DependencyStatus> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error("timeout"));
    }, timeoutMs);
  });
  try {
    await Promise.race([check.ping(), timeout]);
    return "up";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class CheckReadiness {
  constructor(@Inject(DEPENDENCY_CHECKS) private readonly checks: readonly DependencyCheck[]) {}

  async execute(timeoutMs = READINESS_TIMEOUT_MS): Promise<Readiness> {
    const results = await Promise.all(
      this.checks.map(async (check) => [check.name, await probe(check, timeoutMs)] as const),
    );
    const checks = Object.fromEntries(results);
    const status = results.every(([, state]) => state === "up") ? "ok" : "unavailable";
    return { status, checks };
  }
}
