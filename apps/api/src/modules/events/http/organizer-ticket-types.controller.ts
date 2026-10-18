import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  problemDetailsSchema,
  resourceIdSchema,
  type TicketTypeBody,
  ticketTypeSchema,
  type UpdateTicketTypeRequest,
  updateTicketTypeRequestSchema,
} from "@vira/shared";
import type { Request } from "express";

import { RequireRole } from "../../../platform/security/access-policy.js";
import { DeleteTicketType } from "../application/delete-ticket-type.js";
import { UpdateTicketType } from "../application/update-ticket-type.js";
import { ticketTypeBody } from "./bodies.js";
import { callerOf } from "./organizer-events.controller.js";
import { asProblem } from "./problems.js";

const problem = (status: HttpStatus) =>
  ApiResponse({ status, standardSchema: problemDetailsSchema });

/** A ticket type by its own id; its event must be the caller's, or it is `404`. */
@ApiTags("Eventos do organizador")
@RequireRole("ORGANIZER")
@Controller("organizer/ticket-types")
export class OrganizerTicketTypesController {
  constructor(
    private readonly updateTicketType: UpdateTicketType,
    private readonly deleteTicketType: DeleteTicketType,
  ) {}

  @Patch(":id")
  @ApiOperation({
    summary: "Edita um tipo de ingresso",
    description: "A capacidade não fica abaixo de vendidos + reservados (`409`).",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: ticketTypeSchema })
  @problem(HttpStatus.BAD_REQUEST)
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.FORBIDDEN)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.CONFLICT)
  async update(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Body({ schema: updateTicketTypeRequestSchema }) body: UpdateTicketTypeRequest,
    @Req() request: Request,
  ): Promise<TicketTypeBody> {
    return ticketTypeBody(
      await asProblem(() => this.updateTicketType.execute(callerOf(request), id, body)),
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Exclui um tipo de ingresso",
    description: "Só sem vendas nem reservas; um evento publicado mantém ao menos um tipo (`409`).",
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.FORBIDDEN)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.CONFLICT)
  async remove(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Req() request: Request,
  ): Promise<void> {
    await asProblem(() => this.deleteTicketType.execute(callerOf(request), id));
  }
}
