import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type CsrfTokenResponse,
  csrfTokenResponseSchema,
  type LoginRequest,
  loginRequestSchema,
  problemDetailsSchema,
  type RegisterRequest,
  type RegisterResponse,
  registerRequestSchema,
  registerResponseSchema,
  sessionIdSchema,
  type SessionListResponse,
  sessionListResponseSchema,
  type UserResponse,
  userResponseSchema,
  type VerifyEmailRequest,
  verifyEmailRequestSchema,
} from "@vira/shared";
import type { Request, Response } from "express";

import { ProblemException } from "../../../platform/errors/problem.exception.js";
import { RateLimit } from "../../../platform/rate-limit/rate-limit.guard.js";
import {
  RateLimitExceededError,
  rateLimitHeaders,
} from "../../../platform/rate-limit/rate-limiter.js";
import { CLOCK, type Clock } from "../../../platform/runtime/runtime.js";
import {
  type AuthenticatedUser,
  Public,
  RequireRole,
} from "../../../platform/security/access-policy.js";
import { readCookie } from "../../../platform/security/cookies.js";
import { CsrfTokens } from "../../../platform/security/csrf.js";
import { EndSession } from "../application/end-session.js";
import {
  EmailNotVerifiedError,
  InvalidCredentialsError,
  InvalidSessionError,
  InvalidTokenError,
  SessionNotFoundError,
} from "../application/errors.js";
import { ListSessions } from "../application/list-sessions.js";
import { LoginUser } from "../application/login-user.js";
import { AUTH_RATE_LIMITS } from "../application/rate-limits.js";
import { RefreshSession } from "../application/refresh-session.js";
import { RegisterUser } from "../application/register-user.js";
import type { RequestContext } from "../application/request-context.js";
import { StartSession } from "../application/start-session.js";
import { VerifyEmail } from "../application/verify-email.js";
import {
  clearCsrfCookie,
  clearSessionCookies,
  REFRESH_COOKIE,
  writeCsrfCookie,
  writeSessionCookies,
} from "./session-cookies.js";

function contextOf(request: Request): RequestContext {
  return typeof request.id === "string" ? { requestId: request.id } : {};
}

/** The documented answer for each way a use case can refuse. */
async function asProblem<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof InvalidCredentialsError) throw new ProblemException("invalid-credentials");
    if (error instanceof EmailNotVerifiedError) throw new ProblemException("email-not-verified");
    if (error instanceof InvalidTokenError) throw new ProblemException("token-expired");
    if (error instanceof SessionNotFoundError) throw new ProblemException("not-found");
    if (error instanceof RateLimitExceededError) {
      throw new ProblemException("rate-limited", { headers: rateLimitHeaders(error.result) });
    }
    throw error;
  }
}

/** The caller of a route that requires a role; the access guard already ran. */
function callerOf(request: Request): AuthenticatedUser {
  if (!request.user) throw new ProblemException("unauthenticated");
  return request.user;
}

/**
 * Sign-up, e-mail verification, password login and sessions
 * (docs/API.md#autenticação-auth). Routes are public unless they say otherwise.
 * Logging in and verifying an e-mail open a session: an access-token cookie for every
 * route and a refresh-token cookie for this controller only (ADR-0005).
 */
@ApiTags("Autenticação")
@Public()
@Controller("auth")
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUser,
    private readonly verifyEmail: VerifyEmail,
    private readonly loginUser: LoginUser,
    private readonly startSession: StartSession,
    private readonly refreshSession: RefreshSession,
    private readonly endSession: EndSession,
    private readonly listSessions: ListSessions,
    private readonly csrfTokens: CsrfTokens,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Post("register")
  @HttpCode(HttpStatus.ACCEPTED)
  @RateLimit(AUTH_RATE_LIMITS.register)
  @ApiOperation({
    summary: "Cadastra uma conta",
    description:
      "Responde sempre `202` com o mesmo corpo, haja ou não conta com o e-mail: quem já tem " +
      "conta recebe um aviso por e-mail, quem não tem recebe o link de verificação.",
  })
  @ApiResponse({ status: HttpStatus.ACCEPTED, standardSchema: registerResponseSchema })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, standardSchema: problemDetailsSchema })
  async register(
    @Body({ schema: registerRequestSchema }) body: RegisterRequest,
    @Req() request: Request,
  ): Promise<RegisterResponse> {
    await this.registerUser.execute(body, contextOf(request));
    return { status: "accepted" };
  }

  @Post("email/verify")
  @HttpCode(HttpStatus.OK)
  @RateLimit(AUTH_RATE_LIMITS.verifyEmail)
  @ApiOperation({
    summary: "Verifica o e-mail com o token do link e inicia a sessão",
    description:
      "Token de uso único. Expirado, já usado ou desconhecido: `410`. Com sucesso, " +
      "responde com o usuário e os cookies da sessão.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: userResponseSchema })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.GONE, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, standardSchema: problemDetailsSchema })
  async verify(
    @Body({ schema: verifyEmailRequestSchema }) body: VerifyEmailRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponse> {
    const user = await asProblem(() => this.verifyEmail.execute(body, contextOf(request)));
    await this.openSession(user, request, response);
    return { user };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @RateLimit(AUTH_RATE_LIMITS.loginIp)
  @ApiOperation({
    summary: "Entra com e-mail e senha",
    description:
      "Valida as credenciais, inicia a sessão (cookies) e responde com o usuário. " +
      "E-mail inexistente, senha errada e conta bloqueada respondem igual (`401`).",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: userResponseSchema })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, standardSchema: problemDetailsSchema })
  async login(
    @Body({ schema: loginRequestSchema }) body: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserResponse> {
    const user = await asProblem(() => this.loginUser.execute(body, contextOf(request)));
    await this.openSession(user, request, response);
    return { user };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(AUTH_RATE_LIMITS.refresh)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: "Renova a sessão",
    description:
      "Troca o cookie de refresh por um novo e emite um novo token de acesso. Cada refresh " +
      "token vale uma vez: reapresentar um já trocado revoga a sessão inteira (`401`).",
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, standardSchema: problemDetailsSchema })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = readCookie(request, REFRESH_COOKIE);
    if (token === undefined) throw new ProblemException("unauthenticated");
    try {
      const credentials = await this.refreshSession.execute(token, contextOf(request));
      writeSessionCookies(response, credentials, this.clock.now());
    } catch (error) {
      if (!(error instanceof InvalidSessionError)) throw error;
      clearSessionCookies(response);
      throw new ProblemException("unauthenticated");
    }
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole("BUYER")
  @ApiOperation({
    summary: "Encerra a sessão atual",
    description: "Revoga a sessão e limpa os cookies.",
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, standardSchema: problemDetailsSchema })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.endSession.current(callerOf(request));
    clearSessionCookies(response);
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole("BUYER")
  @ApiOperation({
    summary: "Encerra todas as sessões",
    description: "Revoga as sessões da conta em todos os dispositivos e limpa os cookies.",
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, standardSchema: problemDetailsSchema })
  async logoutAll(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.endSession.all(callerOf(request), contextOf(request));
    clearSessionCookies(response);
  }

  @Get("sessions")
  @RequireRole("BUYER")
  @ApiOperation({ summary: "Lista as sessões ativas da conta" })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: sessionListResponseSchema })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  async sessions(@Req() request: Request): Promise<SessionListResponse> {
    const caller = callerOf(request);
    const sessions = await this.listSessions.execute(caller.id, caller.sessionId);
    return {
      data: sessions.map((session) => ({
        id: session.id,
        authenticatedAt: session.authenticatedAt.toISOString(),
        lastRefreshedAt: session.lastRefreshedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        current: session.current,
      })),
    };
  }

  @Delete("sessions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireRole("BUYER")
  @ApiOperation({
    summary: "Encerra uma sessão da conta",
    description: "Sessão de outra conta, inexistente ou já encerrada: `404`.",
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, standardSchema: problemDetailsSchema })
  async revokeSession(
    @Param("id", { schema: sessionIdSchema }) sessionId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const caller = callerOf(request);
    await asProblem(() => this.endSession.one(caller, sessionId, contextOf(request)));
    if (sessionId === caller.sessionId) clearSessionCookies(response);
  }

  @Get("csrf")
  @ApiOperation({
    summary: "Entrega o token CSRF da sessão",
    description:
      "Grava o token num cookie e o devolve no corpo; a página o envia no header " +
      "`X-CSRF-Token` em toda requisição que altera dados. Exige uma sessão (cookie de " +
      "acesso ou de refresh): sem ela, `401`.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: csrfTokenResponseSchema })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  async csrf(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CsrfTokenResponse> {
    // With an expired access token the page still has its refresh cookie, which is sent
    // here (this route is under the refresh cookie's path).
    const refreshToken = readCookie(request, REFRESH_COOKIE);
    const sessionId =
      request.user?.sessionId ??
      (refreshToken === undefined ? null : await this.listSessions.idOf(refreshToken));
    if (sessionId === null) throw new ProblemException("unauthenticated");

    const csrfToken = this.csrfTokens.issue(sessionId);
    writeCsrfCookie(response, csrfToken);
    return { csrfToken };
  }

  /** Cookies for a person who just proved who they are; ends the session they replace. */
  private async openSession(
    user: UserResponse["user"],
    request: Request,
    response: Response,
  ): Promise<void> {
    const credentials = await this.startSession.execute(user, readCookie(request, REFRESH_COOKIE));
    writeSessionCookies(response, credentials, this.clock.now());
    clearCsrfCookie(response);
  }
}
