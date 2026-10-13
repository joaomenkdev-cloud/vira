/** What a login or a refresh hands to the client (as cookies, in the HTTP layer). */
export interface SessionCredentials {
  readonly sessionId: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt: Date;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: Date;
}
