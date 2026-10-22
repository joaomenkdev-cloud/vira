import { z } from "zod";

import { currentPasswordSchema } from "./account.js";
import { OAUTH_PROVIDERS } from "./auth.js";
import { EVENT_STATUSES } from "./events.js";
import { ORDER_STATUSES } from "./orders.js";
import { ROLES } from "./roles.js";
import { TICKET_STATUSES } from "./tickets.js";

/**
 * Contracts of the data subject's rights (V9, docs/PRIVACY.md#4-direitos-do-titular-art-18):
 * the export of everything the account holds (`GET /me/export`) and the deletion of the
 * account (`DELETE /me`), which anonymizes it.
 */

/** What the person types to confirm the deletion, as the modal asks. */
export const ACCOUNT_DELETION_CONFIRMATION = "EXCLUIR";

/** Versioned, so a reader of an old file knows which fields to expect. */
export const DATA_EXPORT_FORMAT = "vira.data-export.v1";

/**
 * Accounts with a password type it again; accounts of social login only leave it out and
 * must have signed in in the last few minutes (`reauthentication-required` otherwise).
 */
export const deleteAccountRequestSchema = z
  .strictObject({
    password: currentPasswordSchema.optional(),
    confirm: z.literal(ACCOUNT_DELETION_CONFIRMATION).meta({
      description: `A palavra ${ACCOUNT_DELETION_CONFIRMATION}, digitada pela pessoa`,
    }),
  })
  .meta({ id: "DeleteAccountRequest" });

const timestamp = z.iso.datetime();

const exportedEventSchema = z.strictObject({
  title: z.string(),
  startsAt: timestamp,
});

/** Everything the account holds, in a documented, machine-readable form (portability). */
export const dataExportSchema = z
  .strictObject({
    format: z.literal(DATA_EXPORT_FORMAT),
    exportedAt: timestamp,
    account: z.strictObject({
      id: z.uuid(),
      email: z.string(),
      pendingEmail: z.string().nullable().meta({
        description: "Novo e-mail esperando a confirmação pelo link enviado a ele",
      }),
      name: z.string(),
      role: z.enum(ROLES),
      hasPassword: z.boolean(),
      emailVerifiedAt: timestamp.nullable(),
      createdAt: timestamp,
    }),
    socialLogins: z.array(
      z.strictObject({
        provider: z.enum(OAUTH_PROVIDERS),
        providerAccountId: z.string().meta({ description: "O id da conta no provedor" }),
        linkedAt: timestamp,
      }),
    ),
    sessions: z
      .array(
        z.strictObject({
          authenticatedAt: timestamp,
          lastRefreshedAt: timestamp,
          expiresAt: timestamp,
        }),
      )
      .meta({ description: "Os logins ainda ativos" }),
    organizerProfile: z
      .strictObject({
        displayName: z.string(),
        slug: z.string(),
        createdAt: timestamp,
        events: z.array(exportedEventSchema.extend({ status: z.enum(EVENT_STATUSES) })),
      })
      .nullable(),
    orders: z.array(
      z.strictObject({
        code: z.string(),
        event: exportedEventSchema,
        status: z.enum(ORDER_STATUSES),
        totalCents: z.number().int(),
        currency: z.string(),
        buyerName: z.string(),
        buyerEmail: z.string(),
        createdAt: timestamp,
        paidAt: timestamp.nullable(),
        items: z.array(
          z.strictObject({
            ticketType: z.string(),
            quantity: z.number().int(),
            unitPriceCents: z.number().int(),
            holderNames: z.array(z.string()),
          }),
        ),
      }),
    ),
    tickets: z.array(
      z.strictObject({
        code: z.string(),
        orderCode: z.string(),
        event: exportedEventSchema,
        ticketType: z.string(),
        holderName: z.string(),
        status: z.enum(TICKET_STATUSES),
        issuedAt: timestamp,
        usedAt: timestamp.nullable(),
        canceledAt: timestamp.nullable(),
      }),
    ),
  })
  .meta({ id: "DataExport" });

export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;
export type DataExport = z.infer<typeof dataExportSchema>;
