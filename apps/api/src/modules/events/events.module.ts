import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { UsersModule } from "../users/users.module.js";
import { CancelEvent } from "./application/cancel-event.js";
import { CreateEvent } from "./application/create-event.js";
import { CreateTicketType } from "./application/create-ticket-type.js";
import { DeleteDraftEvent } from "./application/delete-draft-event.js";
import { DeleteTicketType } from "./application/delete-ticket-type.js";
import { GetOrganizerEvent } from "./application/get-organizer-event.js";
import { ListOrganizerEvents } from "./application/list-organizer-events.js";
import { OrganizerScope } from "./application/organizer-scope.js";
import { EVENT_REPOSITORY } from "./application/ports/event-repository.js";
import { MARKDOWN_RENDERER } from "./application/ports/markdown-renderer.js";
import { PublishEvent } from "./application/publish-event.js";
import { UpdateEvent } from "./application/update-event.js";
import { UpdateTicketType } from "./application/update-ticket-type.js";
import { OrganizerEventsController } from "./http/organizer-events.controller.js";
import { OrganizerTicketTypesController } from "./http/organizer-ticket-types.controller.js";
import { PrismaEventRepository } from "./infra/prisma-event-repository.js";
import { SanitizedMarkdownRenderer } from "./infra/sanitized-markdown-renderer.js";

/** The organizer's side of events: drafts, publication, cancellation, ticket types (N8). */
@Module({
  imports: [AuditModule, UsersModule],
  controllers: [OrganizerEventsController, OrganizerTicketTypesController],
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
    { provide: EVENT_REPOSITORY, useClass: PrismaEventRepository },
    { provide: MARKDOWN_RENDERER, useClass: SanitizedMarkdownRenderer },
  ],
})
export class EventsModule {}
