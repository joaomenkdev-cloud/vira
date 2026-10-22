import { Injectable } from "@nestjs/common";
import type { OAuthProviderName } from "@vira/shared";

import type { Prisma } from "../../../generated/prisma/client.js";
import { clientFor } from "../../../platform/database/prisma-transaction.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TransactionContext } from "../../../platform/database/transaction.js";
import type {
  AccountData,
  ErasureResult,
  PrivacyRepository,
  RetentionSummary,
} from "../application/ports/privacy-repository.js";
import {
  ANONYMIZED,
  anonymizedEmail,
  anonymizedSlug,
  type RetentionCutoffs,
} from "../domain/anonymization.js";

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date ? date.toISOString() : null);

const exportedEvent = { select: { title: true, startsAt: true } } satisfies Prisma.EventDefaultArgs;

const accountSelect = {
  id: true,
  email: true,
  pendingEmail: true,
  name: true,
  role: true,
  passwordHash: true,
  emailVerifiedAt: true,
  createdAt: true,
  oauthAccounts: {
    orderBy: { createdAt: "asc" },
    select: { provider: true, providerAccountId: true, createdAt: true },
  },
  organizerProfile: {
    select: {
      displayName: true,
      slug: true,
      createdAt: true,
      events: {
        orderBy: { startsAt: "asc" },
        select: { title: true, startsAt: true, status: true },
      },
    },
  },
  orders: {
    orderBy: { createdAt: "asc" },
    select: {
      publicCode: true,
      status: true,
      totalCents: true,
      currency: true,
      buyerName: true,
      buyerEmail: true,
      createdAt: true,
      paidAt: true,
      event: exportedEvent,
      items: {
        orderBy: { id: "asc" },
        select: {
          quantity: true,
          unitPriceCents: true,
          holderNames: true,
          ticketType: { select: { name: true } },
        },
      },
      tickets: {
        orderBy: [{ issuedAt: "asc" }, { code: "asc" }],
        select: {
          code: true,
          holderName: true,
          status: true,
          issuedAt: true,
          usedAt: true,
          canceledAt: true,
          event: exportedEvent,
          ticketType: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class PrismaPrivacyRepository implements PrivacyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async exportOf(userId: string, now: Date): Promise<AccountData | null> {
    const [user, sessions] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, anonymizedAt: null },
        select: accountSelect,
      }),
      // The same "still usable" rule as the session list of the account page.
      this.prisma.session.findMany({
        where: { userId, rotatedAt: null, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { authenticatedAt: "desc" },
        select: { authenticatedAt: true, createdAt: true, expiresAt: true },
      }),
    ]);
    if (!user) return null;

    const profile = user.organizerProfile;
    return {
      account: {
        id: user.id,
        email: user.email,
        pendingEmail: user.pendingEmail,
        name: user.name,
        role: user.role,
        hasPassword: user.passwordHash !== null,
        emailVerifiedAt: isoOrNull(user.emailVerifiedAt),
        createdAt: iso(user.createdAt),
      },
      socialLogins: user.oauthAccounts.map((link) => ({
        provider: link.provider.toLowerCase() as OAuthProviderName,
        providerAccountId: link.providerAccountId,
        linkedAt: iso(link.createdAt),
      })),
      sessions: sessions.map((session) => ({
        authenticatedAt: iso(session.authenticatedAt),
        lastRefreshedAt: iso(session.createdAt),
        expiresAt: iso(session.expiresAt),
      })),
      organizerProfile: profile
        ? {
            displayName: profile.displayName,
            slug: profile.slug,
            createdAt: iso(profile.createdAt),
            events: profile.events.map((event) => ({
              title: event.title,
              startsAt: iso(event.startsAt),
              status: event.status,
            })),
          }
        : null,
      orders: user.orders.map((order) => ({
        code: order.publicCode,
        event: { title: order.event.title, startsAt: iso(order.event.startsAt) },
        status: order.status,
        totalCents: order.totalCents,
        currency: order.currency,
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        createdAt: iso(order.createdAt),
        paidAt: isoOrNull(order.paidAt),
        items: order.items.map((item) => ({
          ticketType: item.ticketType.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          holderNames: item.holderNames,
        })),
      })),
      tickets: user.orders.flatMap((order) =>
        order.tickets.map((ticket) => ({
          code: ticket.code,
          orderCode: order.publicCode,
          event: { title: ticket.event.title, startsAt: iso(ticket.event.startsAt) },
          ticketType: ticket.ticketType.name,
          holderName: ticket.holderName,
          status: ticket.status,
          issuedAt: iso(ticket.issuedAt),
          usedAt: isoOrNull(ticket.usedAt),
          canceledAt: isoOrNull(ticket.canceledAt),
        })),
      ),
    };
  }

  async erase(userId: string, now: Date, tx: TransactionContext): Promise<ErasureResult> {
    const client = clientFor(this.prisma, tx);
    const locked = await client.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "users"
       WHERE "id" = ${userId}::uuid AND "anonymized_at" IS NULL
         FOR UPDATE`;
    if (locked.length === 0) return "missing";

    const profile = await client.organizerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (profile) {
      const upcoming = await client.event.count({
        where: { organizerId: profile.id, status: "PUBLISHED", endsAt: { gt: now } },
      });
      if (upcoming > 0) return "upcoming-events";
      await client.organizerProfile.update({
        where: { id: profile.id },
        data: { displayName: ANONYMIZED.organizerName, slug: anonymizedSlug(profile.id) },
      });
    }

    const email = anonymizedEmail(userId);
    await client.user.update({
      where: { id: userId },
      data: {
        email,
        name: ANONYMIZED.userName,
        passwordHash: null,
        pendingEmail: null,
        failedLoginCount: 0,
        lockedUntil: null,
        anonymizedAt: now,
      },
    });
    await client.oAuthAccount.deleteMany({ where: { userId } });
    await client.session.deleteMany({ where: { userId } });
    await client.verificationToken.deleteMany({ where: { userId } });

    // Receipts keep amounts, dates and Stripe ids, but no longer say whose they were.
    await client.order.updateMany({
      where: { buyerId: userId },
      data: { buyerName: ANONYMIZED.userName, buyerEmail: email },
    });
    // An order still being paid stops holding its tickets now: the sweep expires it.
    await client.$executeRaw`
      UPDATE "orders"
         SET "expires_at" = GREATEST(${now}, "created_at" + INTERVAL '1 millisecond')
       WHERE "buyer_id" = ${userId}::uuid AND "status" = 'PENDING' AND "expires_at" > ${now}`;
    await client.$executeRaw`
      UPDATE "order_items" AS i
         SET "holder_names" = array_fill(${ANONYMIZED.holderName}::text, ARRAY[cardinality(i."holder_names")])
        FROM "orders" AS o
       WHERE i."order_id" = o."id" AND o."buyer_id" = ${userId}::uuid
         AND cardinality(i."holder_names") > 0`;
    // Nobody can use a ticket of an erased account any more; past ones stay as history.
    await client.$executeRaw`
      UPDATE "tickets" AS t
         SET "status" = 'CANCELED', "canceled_at" = ${now}
        FROM "orders" AS o, "events" AS e
       WHERE t."order_id" = o."id" AND o."buyer_id" = ${userId}::uuid
         AND t."event_id" = e."id" AND e."ends_at" > ${now} AND t."status" = 'VALID'`;
    await client.$executeRaw`
      UPDATE "tickets" AS t
         SET "holder_name" = ${ANONYMIZED.holderName}
        FROM "orders" AS o
       WHERE t."order_id" = o."id" AND o."buyer_id" = ${userId}::uuid`;
    return "erased";
  }

  async applyRetention(cutoffs: RetentionCutoffs): Promise<RetentionSummary> {
    const holder = ANONYMIZED.holderName;
    const ended = cutoffs.eventsEndedBefore;

    const holdersAnonymized = await this.prisma.$executeRaw`
      UPDATE "tickets" AS t
         SET "holder_name" = ${holder}
        FROM "events" AS e
       WHERE t."event_id" = e."id" AND e."ends_at" < ${ended} AND t."holder_name" <> ${holder}`;
    await this.prisma.$executeRaw`
      UPDATE "order_items" AS i
         SET "holder_names" = array_fill(${holder}::text, ARRAY[cardinality(i."holder_names")])
        FROM "ticket_types" AS tt, "events" AS e
       WHERE i."ticket_type_id" = tt."id" AND tt."event_id" = e."id" AND e."ends_at" < ${ended}
         AND cardinality(i."holder_names") > 0
         AND NOT (i."holder_names" <@ ARRAY[${holder}::text])`;
    const checkinAttemptsPurged = await this.prisma.$executeRaw`
      DELETE FROM "checkin_attempts" AS a
       USING "events" AS e
       WHERE a."event_id" = e."id" AND e."ends_at" < ${ended}`;

    const sessions = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: cutoffs.sessionsExpiredBefore } },
    });
    const tokens = await this.prisma.verificationToken.deleteMany({
      where: { expiresAt: { lt: cutoffs.tokensExpiredBefore } },
    });
    // A new address waits only as long as its link: once no live link is left, it goes too.
    await this.prisma.$executeRaw`
      UPDATE "users" AS u SET "pending_email" = NULL
       WHERE u."pending_email" IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM "verification_tokens" AS v
            WHERE v."user_id" = u."id" AND v."purpose" = 'EMAIL_CHANGE' AND v."used_at" IS NULL
              AND v."expires_at" >= ${cutoffs.tokensExpiredBefore})`;

    const ordersAnonymized = await this.prisma.$executeRaw`
      UPDATE "orders"
         SET "buyer_name" = ${ANONYMIZED.buyerName},
             "buyer_email" = 'removed+' || "id"::text || '@invalid'
       WHERE "created_at" < ${cutoffs.ordersCreatedBefore}
         AND "buyer_email" NOT LIKE '%@invalid'`;

    const webhookEvents = await this.prisma.processedWebhookEvent.deleteMany({
      where: { processedAt: { lt: cutoffs.webhookEventsBefore } },
    });

    return {
      holdersAnonymized,
      checkinAttemptsPurged,
      sessionsPurged: sessions.count,
      tokensPurged: tokens.count,
      ordersAnonymized,
      webhookEventsPurged: webhookEvents.count,
    };
  }
}
