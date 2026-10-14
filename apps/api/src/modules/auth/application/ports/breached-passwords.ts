/**
 * Known leaked passwords (ADR-0005: "checagem contra senhas vazadas"). A password that
 * shows up in public breaches is among the first an attacker tries, whatever its length.
 */
export interface BreachedPasswords {
  /**
   * Whether `password` appears in known breaches. When the source cannot be reached the
   * answer is `false` (and the adapter logs it): an outage there must not stop people
   * from signing up or recovering their accounts.
   */
  includes(password: string): Promise<boolean>;
}

export const BREACHED_PASSWORDS = Symbol("BREACHED_PASSWORDS");
