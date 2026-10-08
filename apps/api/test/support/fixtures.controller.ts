import { Body, Controller, Get, Module, Post } from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { z } from "zod";

import { Public, RequireRole } from "../../src/platform/security/access-policy.js";

export const echoSchema = z.strictObject({
  title: z.string().min(3),
  quantity: z.number().int().min(1).max(10),
});

export const LEAKY_ERROR_MESSAGE = "connect ECONNREFUSED postgres://vira:hunter2@db:5432";

/** Test-only routes that exercise the platform layer. Never registered in the app. */
@Controller("__test")
export class FixturesController {
  constructor(@InjectPinoLogger(FixturesController.name) private readonly logger: PinoLogger) {}

  @Public()
  @Post("echo")
  echo(@Body({ schema: echoSchema }) body: z.infer<typeof echoSchema>): z.infer<typeof echoSchema> {
    return body;
  }

  @Public()
  @Get("boom")
  boom(): never {
    throw new Error(LEAKY_ERROR_MESSAGE);
  }

  @Public()
  @Get("log")
  log(): { logged: true } {
    this.logger.info(
      {
        user: { id: "u1", email: "maria@example.com", name: "Maria Souza" },
        password: "correct horse battery staple",
        order: { buyer: { buyerEmail: "joao@example.com" } },
      },
      "fixture event",
    );
    return { logged: true };
  }

  @Get("undeclared")
  undeclared(): { reached: true } {
    return { reached: true };
  }

  @RequireRole("ORGANIZER")
  @Get("organizer")
  organizer(): { reached: true } {
    return { reached: true };
  }
}

@Module({ controllers: [FixturesController] })
export class FixturesModule {}
