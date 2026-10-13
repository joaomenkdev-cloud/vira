import { Global, Module } from "@nestjs/common";

import { AccessTokens } from "./access-token.js";
import { CsrfTokens } from "./csrf.js";

/** Access tokens and CSRF tokens, for the request pipeline and the auth module. */
@Global()
@Module({
  providers: [AccessTokens, CsrfTokens],
  exports: [AccessTokens, CsrfTokens],
})
export class SecurityModule {}
