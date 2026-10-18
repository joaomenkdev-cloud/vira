import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { UsersModule } from "../users/users.module.js";
import { AttachEventImage } from "./application/attach-event-image.js";
import { CancelEvent } from "./application/cancel-event.js";
import { CreateEvent } from "./application/create-event.js";
import { CreateTicketType } from "./application/create-ticket-type.js";
import { DeleteDraftEvent } from "./application/delete-draft-event.js";
import { DeleteTicketType } from "./application/delete-ticket-type.js";
import { GetOrganizerEvent } from "./application/get-organizer-event.js";
import { ListOrganizerEvents } from "./application/list-organizer-events.js";
import { OrganizerScope } from "./application/organizer-scope.js";
import { EVENT_REPOSITORY } from "./application/ports/event-repository.js";
import { IMAGE_PROCESSOR } from "./application/ports/image-processor.js";
import { MARKDOWN_RENDERER } from "./application/ports/markdown-renderer.js";
import { MEDIA_UPLOAD_REPOSITORY } from "./application/ports/media-upload-repository.js";
import { PublishEvent } from "./application/publish-event.js";
import { RequestImageUpload } from "./application/request-image-upload.js";
import { SweepMediaUploads } from "./application/sweep-media-uploads.js";
import { UpdateEvent } from "./application/update-event.js";
import { UpdateTicketType } from "./application/update-ticket-type.js";
import { EventPresenter } from "./http/event-presenter.js";
import { OrganizerEventImagesController } from "./http/organizer-event-images.controller.js";
import { OrganizerEventsController } from "./http/organizer-events.controller.js";
import { OrganizerTicketTypesController } from "./http/organizer-ticket-types.controller.js";
import { MediaSweeper } from "./infra/media-sweeper.js";
import { PrismaEventRepository } from "./infra/prisma-event-repository.js";
import { PrismaMediaUploadRepository } from "./infra/prisma-media-upload-repository.js";
import { SanitizedMarkdownRenderer } from "./infra/sanitized-markdown-renderer.js";
import { SharpImageProcessor } from "./infra/sharp-image-processor.js";

/**
 * The organizer's side of events: drafts, publication, cancellation, ticket types (N8)
 * and the picture (N9).
 */
@Module({
  imports: [AuditModule, UsersModule],
  controllers: [
    OrganizerEventsController,
    OrganizerEventImagesController,
    OrganizerTicketTypesController,
  ],
  providers: [
    OrganizerScope,
    ListOrganizerEvents,
    CreateEvent,
    GetOrganizerEvent,
    UpdateEvent,
    DeleteDraftEvent,
    PublishEvent,
    CancelEvent,
    CreateTicketType,
    UpdateTicketType,
    DeleteTicketType,
    RequestImageUpload,
    AttachEventImage,
    EventPresenter,
    { provide: EVENT_REPOSITORY, useClass: PrismaEventRepository },
    { provide: MEDIA_UPLOAD_REPOSITORY, useClass: PrismaMediaUploadRepository },
    { provide: MARKDOWN_RENDERER, useClass: SanitizedMarkdownRenderer },
    { provide: IMAGE_PROCESSOR, useClass: SharpImageProcessor },
  ],
})
export class EventsModule {}

/** Background work of events: the upload sweep. Imported by the worker (and embedded mode). */
@Module({
  providers: [
    SweepMediaUploads,
    MediaSweeper,
    { provide: MEDIA_UPLOAD_REPOSITORY, useClass: PrismaMediaUploadRepository },
  ],
})
export class EventsJobsModule {}
