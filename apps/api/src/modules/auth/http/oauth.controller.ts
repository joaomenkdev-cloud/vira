import { Controller, Get, HttpStatus, Inject, Param, Query, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  OAUTH_PROVIDERS,
  type OAuthLoginError,
  type OAuthProviderName,
  problemDetailsSchema,
  type PublicUser,
} from "@vira/shared";
import type { Request, Response } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { z } from "zod";

import { APP_CONFIG } from "../../../platform/config/config.module.js";
import type { AppConfig } from "../../../platform/config/config.schema.js";
import { ProblemException } from "../../../platform/errors/problem.exception.js";
import { RateLimit } from "../../../platform/rate-limit/rate-limit.guard.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import { Public } from "../../../platform/security/access-policy.js";
import { readCookie } from "../../../platform/security/cookies.js";
import { sameToken } from "../../../platform/security/csrf.js";
import { BeginOAuthLogin } from "../application/begin-oauth-login.js";
import { CompleteOAuthLogin } from "../application/complete-oauth-login.js";
import { ProviderEmailNotVerifiedError } from "../application/errors.js";
import {
  OAUTH_PROVIDERS as CONFIGURED_PROVIDERS,
  OAuthProviderError,
  type OAuthProviders,
} from "../application/ports/oauth-provider.js";
import { AUTH_RATE_LIMITS } from "../application/rate-limits.js";
import type { RequestContext } from "../application/request-context.js";
import { StartSession } from "../application/start-session.js";
import type { OAuthAttempt } from "../domain/oauth.js";
import {
  OAUTH_ATTEMPT_COOKIE,
  OAUTH_ATTEMPT_COOKIE_PATH,
  OAuthAttemptCookie,
} from "./oauth-attempt-cookie.js";
import { clearCsrfCookie, REFRESH_COOKIE, writeSessionCookies } from "./session-cookies.js";

/** Where the web app's login page lives; it explains `?erro=` (N7). */
const LOGIN_PAGE = "/entrar";

/** An error code without its `oauth-` prefix, which `refuse` adds. */
type Refusal = OAuthLoginError extends `oauth-${infer Kind}` ? Kind : never;

/**
 * What the provider appends to the callback. Not strict: providers add their own
 * parameters (`scope`, `authuser`, `prompt`, `iss`).
 */
const callbackQuerySchema = z.object({
  code: z.string().min(1).max(2048).optional(),
  state: z.string().min(1).max(256).optional(),
  error: z.string().max(256).optional(),
});

function providerOf(value: string): OAuthProviderName | undefined {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value)
    ? (value as OAuthProviderName)
    : undefined;
}

function contextOf(request: Request): RequestContext {
  return typeof request.id === "string" ? { requestId: request.id } : {};
}

/**
 * Social login with Google and GitHub (docs/API.md#login-social-n5, ADR-0005). Both
 * routes answer with redirects, because the browser navigates to them: the start sends
 * it to the provider; the callback opens the session and sends it to the web app, or to
 * the login page with an error code. A provider without credentials answers `404`.
 */
@ApiTags("Autenticação")
@Public()
@Controller("auth/oauth")
export class OAuthController {
  private readonly webOrigin: string;

  constructor(
    private readonly beginLogin: BeginOAuthLogin,
    private readonly completeLogin: CompleteOAuthLogin,
    private readonly startSession: StartSession,
    private readonly attempts: OAuthAttemptCookie,
    @Inject(CONFIGURED_PROVIDERS) private readonly configured: OAuthProviders,
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
    @InjectPinoLogger(OAuthController.name) private readonly logger: PinoLogger,
  ) {
    this.webOrigin = config.http.webOrigin;
  }

  @Get(":provider")
  @RateLimit(AUTH_RATE_LIMITS.oauthStart)
  @ApiOperation({
    summary: "Começa o login social",
    description:
      "Redireciona para o provedor com `state`, PKCE (S256) e, no Google, `nonce`. Os " +
      "segredos da tentativa ficam num cookie `HttpOnly` por 10 minutos.",
  })
  @ApiParam({ name: "provider", enum: OAUTH_PROVIDERS })
  @ApiQuery({
    name: "next",
    required: false,
    description: "Caminho do web para onde voltar depois do login (ex.: `/eventos/x`)",
  })
  @ApiResponse({ status: HttpStatus.FOUND, description: "Para o provedor" })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, standardSchema: problemDetailsSchema })
  start(
    @Param("provider") providerName: string,
    @Query("next") next: unknown,
    @Res() response: Response,
  ): void {
    const provider = this.availableProvider(providerName);
    const { authorizationUrl, attempt } = this.beginLogin.execute({
      provider,
      redirectUri: this.callbackUrl(provider),
      returnTo: typeof next === "string" ? next : undefined,
    });
    this.attempts.write(response, attempt);
    response.setHeader("Cache-Control", "no-store");
    response.redirect(HttpStatus.FOUND, authorizationUrl.href);
  }

  @Get(":provider/callback")
  @RateLimit(AUTH_RATE_LIMITS.oauthCallback)
  @ApiOperation({
    summary: "Volta do provedor e inicia a sessão",
    description:
      "Confere o `state` com o cookie da tentativa, troca o código (com o verificador " +
      "PKCE) pelo perfil e encontra ou cria a conta. Sucesso: cookies da sessão e " +
      "redirecionamento para o web. Falha: redirecionamento para `/entrar?erro=<código>`.",
  })
  @ApiParam({ name: "provider", enum: OAUTH_PROVIDERS })
  @ApiResponse({ status: HttpStatus.FOUND, description: "Para o web, com ou sem sessão" })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, standardSchema: problemDetailsSchema })
  async callback(
    @Param("provider") providerName: string,
    @Query() rawQuery: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const provider = this.availableProvider(providerName);
    response.setHeader("Cache-Control", "no-store");
    // Whatever happens next, this attempt is spent.
    const attempt = this.attempts.read(readCookie(request, OAUTH_ATTEMPT_COOKIE));
    this.attempts.clear(response);

    const outcome = await this.finish(provider, attempt, rawQuery, request);
    if (typeof outcome === "string") {
      response.redirect(HttpStatus.FOUND, `${this.webOrigin}${LOGIN_PAGE}?erro=${outcome}`);
      return;
    }

    const credentials = await this.startSession.execute(
      outcome.user,
      readCookie(request, REFRESH_COOKIE),
    );
    writeSessionCookies(response, credentials, this.clock.now());
    clearCsrfCookie(response);
    response.redirect(HttpStatus.FOUND, `${this.webOrigin}${outcome.returnTo ?? "/"}`);
  }

  /** The account to open a session for, or why there is none. */
  private async finish(
    provider: OAuthProviderName,
    attempt: OAuthAttempt | null,
    rawQuery: unknown,
    request: Request,
  ): Promise<{ user: PublicUser; returnTo: string | null } | OAuthLoginError> {
    const query = callbackQuerySchema.safeParse(rawQuery);
    if (!query.success) return this.refuse("failed", "malformed callback");
    const { code, state, error } = query.data;
    if (error !== undefined) {
      const denied = error === "access_denied";
      return this.refuse(denied ? "denied" : "failed", `provider error ${error}`);
    }
    // The state must be the one this browser was given: anything else is a callback
    // someone else started (login CSRF), an expired attempt or another provider's.
    if (attempt?.provider !== provider || state === undefined || !sameToken(state, attempt.state)) {
      return this.refuse("failed", "state mismatch or expired attempt");
    }
    if (code === undefined) return this.refuse("failed", "no code");

    try {
      const user = await this.completeLogin.execute(
        {
          provider,
          code,
          codeVerifier: attempt.codeVerifier,
          nonce: attempt.nonce,
          redirectUri: this.callbackUrl(provider),
        },
        contextOf(request),
      );
      return { user, returnTo: attempt.returnTo };
    } catch (failure) {
      if (failure instanceof ProviderEmailNotVerifiedError) {
        return this.refuse("email-not-verified", "provider e-mail not verified");
      }
      if (failure instanceof OAuthProviderError) return this.refuse("failed", failure.message);
      throw failure;
    }
  }

  /** The callback URL registered with the provider, on the web origin (its proxy forwards it here). */
  private callbackUrl(provider: OAuthProviderName): string {
    return `${this.webOrigin}${OAUTH_ATTEMPT_COOKIE_PATH}/${provider}/callback`;
  }

  /** An unknown provider and one without credentials look the same: `404`. */
  private availableProvider(name: string): OAuthProviderName {
    const provider = providerOf(name);
    if (!provider || !this.configured.has(provider)) throw new ProblemException("not-found");
    return provider;
  }

  private refuse(refusal: Refusal, reason: string): OAuthLoginError {
    const code: OAuthLoginError = `oauth-${refusal}`;
    this.logger.warn({ oauthError: code, reason }, "social login refused");
    return code;
  }
}
