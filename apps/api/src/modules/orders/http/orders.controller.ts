import { Body, Controller, Get, Headers, HttpStatus, Param, Post, Req, Res } from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  type CreateOrderRequest,
  createOrderRequestSchema,
  idempotencyKeySchema,
  type OrderBody,
  orderSchema,
  problemDetailsSchema,
  resourceIdSchema,
} from "@vira/shared";
import type { Request, Response } from "express";

import { ProblemException } from "../../../platform/errors/problem.exception.js";
import { RateLimit } from "../../../platform/rate-limit/rate-limit.guard.js";
import { type AuthenticatedUser, RequireRole } from "../../../platform/security/access-policy.js";
import type { RequestContext } from "../application/buyer.js";
import { CreateOrder } from "../application/create-order.js";
import { GetOrder } from "../application/get-order.js";
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
}
