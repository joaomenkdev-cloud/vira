import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type CreateOrderRequest,
  createOrderRequestSchema,
  idempotencyKeySchema,
  type OrderBody,
  orderSchema,
  type PaymentSessionBody,
  paymentSessionSchema,
  problemDetailsSchema,
  resourceIdSchema,
} from "@vira/shared";
import type { Request, Response } from "express";

import { ProblemException } from "../../../platform/errors/problem.exception.js";
import { RateLimit } from "../../../platform/rate-limit/rate-limit.guard.js";
import { type AuthenticatedUser, RequireRole } from "../../../platform/security/access-policy.js";
import type { RequestContext } from "../application/buyer.js";
import { CancelOrder } from "../application/cancel-order.js";
import { CreateOrder } from "../application/create-order.js";
import { ExtendOrder } from "../application/extend-order.js";
import { GetOrder } from "../application/get-order.js";
import { StartPayment } from "../application/start-payment.js";
import { ORDERS_RATE_LIMITS } from "../application/rate-limits.js";
import { orderBody } from "./bodies.js";
import { asProblem } from "./problems.js";

function callerOf(request: Request): AuthenticatedUser {
  if (!request.user) throw new ProblemException("unauthenticated");
  return request.user;
}

function contextOf(request: Request): RequestContext {
  return typeof request.id === "string" ? { requestId: request.id } : {};
}

const problem = (status: HttpStatus) =>
  ApiResponse({ status, standardSchema: problemDetailsSchema });

/**
 * The buyer's orders (docs/API.md#pedidos-orders). Every route acts only on the caller's
 * own orders: one of someone else answers `404`, exactly like one that does not exist.
 */
@ApiTags("Pedidos")
@RequireRole("BUYER")
@Controller("orders")
export class OrdersController {
  constructor(
    private readonly createOrder: CreateOrder,
    private readonly getOrder: GetOrder,
    private readonly extendOrder: ExtendOrder,
    private readonly cancelOrder: CancelOrder,
    private readonly startPayment: StartPayment,
  ) {}

  @Post()
  @RateLimit(ORDERS_RATE_LIMITS.createIp)
  @ApiOperation({
    summary: "Reserva ingressos (cria um pedido PENDING)",
    description:
      "Segura os ingressos por 10 minutos. O preço e o total vêm do banco, nunca do corpo. " +
      "A mesma `Idempotency-Key` com o mesmo corpo devolve o mesmo pedido (`200`, " +
      "`Idempotent-Replayed: true`); com outro corpo, `422`.",
  })
  @ApiHeader({
    name: "Idempotency-Key",
    required: true,
    description: "UUID por tentativa de compra",
  })
  @ApiResponse({ status: HttpStatus.CREATED, standardSchema: orderSchema })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: orderSchema, description: "Repetição" })
  @problem(HttpStatus.BAD_REQUEST)
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.CONFLICT)
  @problem(HttpStatus.UNPROCESSABLE_ENTITY)
  @problem(HttpStatus.TOO_MANY_REQUESTS)
  async create(
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body({ schema: createOrderRequestSchema }) body: CreateOrderRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OrderBody> {
    const key = idempotencyKeySchema.safeParse(idempotencyKey);
    if (!key.success) {
      throw new ProblemException("validation-failed", {
        errors: [{ path: "Idempotency-Key", message: "envie um UUID por tentativa de compra" }],
      });
    }
    const { order, replayed } = await asProblem(() =>
      this.createOrder.execute(callerOf(request), key.data, body, contextOf(request)),
    );
    if (replayed) {
      response.status(HttpStatus.OK).set("Idempotent-Replayed", "true");
    } else {
      response.status(HttpStatus.CREATED).location(`/api/v1/orders/${order.id}`);
    }
    return orderBody(order);
  }

  @Get(":id")
  @ApiOperation({ summary: "Um pedido do próprio comprador" })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: orderSchema })
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.NOT_FOUND)
  async get(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Req() request: Request,
  ): Promise<OrderBody> {
    return orderBody(await asProblem(() => this.getOrder.execute(callerOf(request), id)));
  }

  @Post(":id/payment")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Inicia o pagamento do pedido (PaymentIntent do Stripe, modo de teste)",
    description:
      "Devolve o `clientSecret` do PaymentIntent do pedido e a chave publicável para o " +
      "Payment Element. O valor é o total gravado no pedido. Chamar de novo devolve o " +
      "mesmo PaymentIntent. O pedido só vira `PAID` pelo webhook do Stripe.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: paymentSessionSchema })
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.CONFLICT)
  @problem(HttpStatus.TOO_MANY_REQUESTS)
  @problem(HttpStatus.SERVICE_UNAVAILABLE)
  async payment(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Req() request: Request,
  ): Promise<PaymentSessionBody> {
    const session = await asProblem(() => this.startPayment.execute(callerOf(request), id));
    return { clientSecret: session.clientSecret, publishableKey: session.publishableKey };
  }

  @Post(":id/extend")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Estende a reserva uma única vez (+10 min)",
    description:
      "Só com o pedido `PENDING`, nos 2 minutos finais da reserva e uma vez por pedido " +
      "(WCAG 2.2.1). Os ingressos continuam segurados; muda só o `expiresAt`.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: orderSchema })
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.CONFLICT)
  async extend(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Req() request: Request,
  ): Promise<OrderBody> {
    return orderBody(await asProblem(() => this.extendOrder.execute(callerOf(request), id)));
  }

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Cancela a reserva e libera os ingressos",
    description:
      "Só pedidos `PENDING`. Repetir o pedido de cancelamento devolve o pedido já " +
      "cancelado (`200`); pago, expirado ou reembolsado é `409`.",
  })
  @ApiResponse({ status: HttpStatus.OK, standardSchema: orderSchema })
  @problem(HttpStatus.UNAUTHORIZED)
  @problem(HttpStatus.NOT_FOUND)
  @problem(HttpStatus.CONFLICT)
  async cancel(
    @Param("id", { schema: resourceIdSchema }) id: string,
    @Req() request: Request,
  ): Promise<OrderBody> {
    return orderBody(
      await asProblem(() => this.cancelOrder.execute(callerOf(request), id, contextOf(request))),
    );
  }
}
