import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type Account as AccountBody,
  type AccountResponse,
  accountResponseSchema,
  accountSchema,
  type BecomeOrganizerRequest,
  becomeOrganizerRequestSchema,
  type OrganizerProfileResponse,
  organizerProfileResponseSchema,
  problemDetailsSchema,
  type UpdateProfileRequest,
  updateProfileRequestSchema,
} from "@vira/shared";
import type { Request } from "express";

import { ProblemException } from "../../../platform/errors/problem.exception.js";
import { type AuthenticatedUser, RequireRole } from "../../../platform/security/access-policy.js";
import { BecomeOrganizer } from "../application/become-organizer.js";
import { AccountNotFoundError, AlreadyOrganizerError } from "../application/errors.js";
import { GetAccount } from "../application/get-account.js";
import { UpdateProfile } from "../application/update-profile.js";
import type { Account, OrganizerProfile } from "../domain/account.js";

function callerOf(request: Request): AuthenticatedUser {
  if (!request.user) throw new ProblemException("unauthenticated");
  return request.user;
}

async function asProblem<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    // A valid access token for an account that no longer exists: there is no session.
    if (error instanceof AccountNotFoundError) throw new ProblemException("unauthenticated");
    if (error instanceof AlreadyOrganizerError) throw new ProblemException("already-organizer");
    throw error;
  }
}

function profileBody(profile: OrganizerProfile) {
  return { displayName: profile.displayName, slug: profile.slug };
}

/** What the API shows of an account: no hash, no counters, no internal ids of the profile. */
function accountBody(account: Account): AccountBody {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    emailVerified: account.emailVerified,
    hasPassword: account.hasPassword,
    ...(account.organizer ? { organizer: profileBody(account.organizer) } : {}),
  };
}

/**
 * The caller's own account (docs/API.md#conta-e-privacidade-users). Every route acts
 * on the account of the session and takes no id, so there is no one else's account to
 * reach (OWASP API1). Password and e-mail changes are in the `auth` module.
 */
@ApiTags("Conta")
@RequireRole("BUYER")
@Controller("me")
export class MeController {
  constructor(
    private readonly getAccount: GetAccount,
    private readonly updateProfile: UpdateProfile,
    private readonly becomeOrganizer: BecomeOrganizer,
  ) {}

  @Get()
  @ApiOperation({ summary: "Mostra a conta da sessão" })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: accountSchema })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  async me(@Req() request: Request): Promise<AccountBody> {
    const account = await asProblem(() => this.getAccount.execute(callerOf(request).id));
    return accountBody(account);
  }

  @Patch()
  @ApiOperation({
    summary: "Edita o perfil",
    description:
      "Só o nome. Qualquer outro campo (papel, e-mail, senha, verificação) é `400`: o " +
      "e-mail e a senha têm rotas próprias, e o papel nunca vem do corpo.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: accountResponseSchema })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, standardSchema: problemDetailsSchema })
  async update(
    @Body({ schema: updateProfileRequestSchema }) body: UpdateProfileRequest,
    @Req() request: Request,
  ): Promise<AccountResponse> {
    const account = await asProblem(() => this.updateProfile.execute(callerOf(request).id, body));
    return { user: accountBody(account) };
  }

  @Post("organizer")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Cria o perfil de organizador",
    description:
      "A conta passa a ORGANIZER (ADMIN continua ADMIN). O token de acesso atual ainda leva " +
      "o papel antigo: o novo vale a partir do próximo `POST /auth/refresh`. Conta que já " +
      "tem perfil: `409` `already-organizer`.",
  })
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: organizerProfileResponseSchema })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.CONFLICT, standardSchema: problemDetailsSchema })
  async organizer(
    @Body({ schema: becomeOrganizerRequestSchema }) body: BecomeOrganizerRequest,
    @Req() request: Request,
  ): Promise<OrganizerProfileResponse> {
    const caller = callerOf(request);
    const profile = await asProblem(() =>
      this.becomeOrganizer.execute(
        caller,
        body,
        typeof request.id === "string" ? { requestId: request.id } : {},
      ),
    );
    return { organizerProfile: profileBody(profile) };
  }
}
