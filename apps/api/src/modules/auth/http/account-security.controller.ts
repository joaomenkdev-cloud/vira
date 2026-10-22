import { Body, Controller, Delete, HttpCode, HttpStatus, Post, Req, Res } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type AcceptedResponse,
  acceptedResponseSchema,
  type ChangeEmailRequest,
  changeEmailRequestSchema,
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  type DeleteAccountRequest,
  deleteAccountRequestSchema,
  problemDetailsSchema,
} from "@vira/shared";
import type { Request, Response } from "express";

import { RequireRole } from "../../../platform/security/access-policy.js";
import { ChangePassword } from "../application/change-password.js";
import { DeleteAccount } from "../application/delete-account.js";
import { RequestEmailChange } from "../application/request-email-change.js";
import { asProblem, callerOf, contextOf } from "./problems.js";
import { clearSessionCookies } from "./session-cookies.js";

/**
 * The credentials of the caller's own account (docs/API.md#conta-e-privacidade-users):
 * password and e-mail, and the account itself (its deletion). All ask for proof of who is
 * at the keyboard again. The rest of `/me` (profile, organizer, export) belongs to the
 * `users` and `privacy` modules.
 */
@ApiTags("Conta")
@RequireRole("BUYER")
@Controller("me")
export class AccountSecurityController {
  constructor(
    private readonly changePassword: ChangePassword,
    private readonly requestEmailChange: RequestEmailChange,
    private readonly deleteAccount: DeleteAccount,
  ) {}

  @Delete()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Exclui a conta",
    description:
      "Anonimiza a conta (docs/PRIVACY.md): nome e e-mail substituídos em todo lugar, " +
      "sessões, logins sociais e links apagados, ingressos de eventos futuros cancelados. " +
      'Pede `confirm: "EXCLUIR"` e a senha (`password`); conta só de login social não ' +
      "manda senha, mas precisa ter entrado há menos de 5 minutos (senão `401` " +
      "`reauthentication-required`). Organizador com evento publicado por acontecer: `409` " +
      "`organizer-has-upcoming-events`. Limpa os cookies da sessão.",
  })
  @ApiResponse({ status: HttpStatus.ACCEPTED, standardSchema: acceptedResponseSchema })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.CONFLICT, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, standardSchema: problemDetailsSchema })
  async remove(
    @Body({ schema: deleteAccountRequestSchema }) body: DeleteAccountRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AcceptedResponse> {
    await asProblem(() => this.deleteAccount.execute(callerOf(request), body, contextOf(request)), {
      currentPassword: "password",
    });
    clearSessionCookies(response);
    return { status: "accepted" };
  }

  @Post("password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Troca a senha",
    description:
      "Exige a senha atual. Encerra as outras sessões da conta; a atual continua. Conta só " +
      "de login social (sem senha): `409` `password-not-set` (a senha é criada por " +
      "“esqueci a senha”). Nova senha encontrada em vazamentos: `400` `breached-password`.",
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.CONFLICT, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, standardSchema: problemDetailsSchema })
  async password(
    @Body({ schema: changePasswordRequestSchema }) body: ChangePasswordRequest,
    @Req() request: Request,
  ): Promise<void> {
    await asProblem(
      () => this.changePassword.execute(callerOf(request), body, contextOf(request)),
      { newPassword: "newPassword" },
    );
  }

  @Post("email")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Pede a troca do e-mail",
    description:
      "Exige a senha atual. Envia um link de confirmação ao novo endereço e um aviso ao " +
      "atual; o e-mail só muda quando o link for usado (`POST /auth/email/change/confirm`). " +
      "Responde `202` mesmo que o endereço já seja de outra conta (que recebe um aviso).",
  })
  @ApiResponse({ status: HttpStatus.ACCEPTED, standardSchema: acceptedResponseSchema })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.CONFLICT, standardSchema: problemDetailsSchema })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, standardSchema: problemDetailsSchema })
  async email(
    @Body({ schema: changeEmailRequestSchema }) body: ChangeEmailRequest,
    @Req() request: Request,
  ): Promise<AcceptedResponse> {
    await asProblem(() =>
      this.requestEmailChange.execute(callerOf(request), body, contextOf(request)),
    );
    return { status: "accepted" };
  }
}
