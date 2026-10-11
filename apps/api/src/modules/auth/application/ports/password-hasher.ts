export interface PasswordHasher {
  /** argon2id PHC string with a fresh random salt. */
  hash(password: string): Promise<string>;

  /**
   * Whether `password` matches `hash`. A `null` hash (no such account, or one without a
   * password) is checked against a dummy hash of the same cost and always answers
   * `false`, so a missing account takes as long to refuse as a wrong password does.
   */
  verify(hash: string | null, password: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol("PASSWORD_HASHER");
