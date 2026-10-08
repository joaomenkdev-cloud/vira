import { type DynamicModule, Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import type { DestinationStream } from "pino";

import type { AppConfig } from "../config/config.schema.js";
import { pinoHttpOptions } from "./pino-options.js";

export interface LoggingOptions {
  /** Where log lines go. Defaults to stdout (pretty-printed in development). */
  readonly destination?: DestinationStream | undefined;
}

@Module({})
export class LoggingModule {
  static forRoot(config: AppConfig, { destination }: LoggingOptions = {}): DynamicModule {
    const options = pinoHttpOptions(config);

    if (destination) {
      return {
        module: LoggingModule,
        imports: [LoggerModule.forRoot({ pinoHttp: [options, destination] })],
      };
    }

    const transport = config.log.pretty ? { target: "pino-pretty" } : undefined;
    return {
      module: LoggingModule,
      imports: [
        LoggerModule.forRoot({ pinoHttp: transport ? { ...options, transport } : options }),
      ],
    };
  }
}
