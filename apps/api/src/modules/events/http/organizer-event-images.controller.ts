import { Body, Controller, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type AttachEventImageRequest,
  attachEventImageRequestSchema,
  type ImageUpload,
  imageUploadSchema,
  type OrganizerEvent,
  organizerEventSchema,
  problemDetailsSchema,
  type RequestImageUpload as RequestImageUploadBody,
  requestImageUploadSchema,
  resourceIdSchema,
} from "@vira/shared";
import type { Request } from "express";

import { RequireRole } from "../../../platform/security/access-policy.js";
import { AttachEventImage } from "../application/attach-event-image.js";
import { RequestImageUpload } from "../application/request-image-upload.js";
import { EventPresenter } from "./event-presenter.js";
import { callerOf } from "./organizer-events.controller.js";
import { asProblem } from "./problems.js";

const problem = (status: HttpStatus) =>
  ApiResponse({ status, standardSchema: problemDetailsSchema });

/**
 * The event's picture, in two steps (docs/API.md#eventos-do-organizador-events): a
 * pre-signed URL to send the file straight to the private bucket, then the confirmation
 * that checks and re-encodes it. Same ownership rule as every organizer route.
 */
@ApiTags("Eventos do organizador")
@RequireRole("ORGANIZER")
@Controller("organizer/events/:id/image")
export class OrganizerEventImagesController {
  constructor(
    private readonly requestUpload: RequestImageUpload,
    private readonly attachImage: AttachEventImage,
    private readonly presenter: EventPresenter,
  ) {}

  @Post("upload-url")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Pede a URL para enviar a imagem",
    description:
      "Responde uma URL de `PUT` pré-assinada, válida por 5 minutos, para um arquivo JPEG, " +
      "PNG ou WebP de até 5 MB. O tipo e o tamanho exato ficam na assinatura: o envio tem " +
      "de levar os `headers` da resposta e ter o tamanho informado. Depois, confirme com " +
      "`POST /organizer/events/{id}/image`. Até 20 URLs por hora por conta.",
  })
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: imageUploadSchema })
  @problem(HttpStatus.BAD_REQUEST)
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.FORBIDDEN)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.CONFLICT)
  @problem(HttpStatus.TOO_MANY_REQUESTS)
  async uploadUrl(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Body({ schema: requestImageUploadSchema }) body: RequestImageUploadBody,
    @Req() request: Request,
  ): Promise<ImageUpload> {
    const issued = await asProblem(() => this.requestUpload.execute(callerOf(request), id, body));
    return {
      uploadId: issued.uploadId,
      url: issued.url,
      headers: { ...issued.headers },
      expiresAt: issued.expiresAt.toISOString(),
    };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Confirma a imagem enviada",
    description:
      "O servidor confere o arquivo (tamanho e formato real), recusa o que não for imagem " +
      "ou for menor que 1200 × 600, remove os metadados (EXIF, GPS), converte para WebP e " +
      "gera a prévia borrada. Arquivo recusado: `422`, e é preciso pedir outra URL. Troca a " +
      "imagem anterior, inclusive de um evento publicado.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: organizerEventSchema })
  @problem(HttpStatus.BAD_REQUEST)
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.FORBIDDEN)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.CONFLICT)
  @problem(HttpStatus.UNPROCESSABLE_ENTITY)
  async attach(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Body({ schema: attachEventImageRequestSchema }) body: AttachEventImageRequest,
    @Req() request: Request,
  ): Promise<OrganizerEvent> {
    return this.presenter.event(
      await asProblem(() => this.attachImage.execute(callerOf(request), id, body)),
    );
  }
}
