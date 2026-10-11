import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type LoginRequest,
  loginRequestSchema,
  problemDetailsSchema,
  type RegisterRequest,
  type RegisterResponse,
  registerRequestSchema,
  registerResponseSchema,
  type UserResponse,
  userResponseSchema,
  type VerifyEmailRequest,
  verifyEmailRequestSchema,
} from "@vira/shared";
import type { Request } from "express";

import { ProblemException } from "../../../platform/errors/problem.exception.js";
import { RateLimit } from "../../../platform/rate-limit/rate-limit.guard.js";
import {
  RateLimitExceededError,
  rateLimitHeaders,
} from "../../../platform/rate-limit/rate-limiter.js";
import { Public } from "../../../platform/security/access-policy.js";
import {
  EmailNotVerifiedError,
  InvalidCredentialsError,
  InvalidTokenError,
} from "../application/errors.js";
import { LoginUser } from "../application/login-user.js";
import { AUTH_RATE_LIMITS } from "../application/rate-limits.js";
import { RegisterUser } from "../application/register-user.js";
import type { RequestContext } from "../application/request-context.js";
import { VerifyEmail } from "../application/verify-email.js";

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
    if (error instanceof RateLimitExceededError) {
      throw new ProblemException("rate-limited", { headers: rateLimitHeaders(error.result) });
    }
    throw error;
  }
}

/**
 * Sign-up, e-mail verification and password login (docs/API.md#autenticação-auth).
 * Everything here is reachable without a session. Cookies and sessions arrive with N4:
 * until then a successful login only answers with the user.
 */
@ApiTags("Autenticação")
@Public()
@Controller("auth")
export class AuthController {
  constructor(
    private readonly registerUser: RegisterUser,
    private readonly verifyEmail: VerifyEmail,
    private readonly loginUser: LoginUser,
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
    summary: "Verifica o e-mail com o token do link",
    description: "Token de uso único. Expirado, já usado ou desconhecido: `410`.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: userResponseSchema })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.GONE, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, standardSchema: problemDetailsSchema })
  async verify(
    @Body({ schema: verifyEmailRequestSchema }) body: VerifyEmailRequest,
    @Req() request: Request,
  ): Promise<UserResponse> {
    const user = await asProblem(() => this.verifyEmail.execute(body, contextOf(request)));
    return { user };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @RateLimit(AUTH_RATE_LIMITS.loginIp)
  @ApiOperation({
    summary: "Entra com e-mail e senha",
    description:
      "Valida as credenciais e responde com o usuário (a sessão e os cookies chegam com a N4). " +
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
  ): Promise<UserResponse> {
    const user = await asProblem(() => this.loginUser.execute(body, contextOf(request)));
    return { user };
  }
}
