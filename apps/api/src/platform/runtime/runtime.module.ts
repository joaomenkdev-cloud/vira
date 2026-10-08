import { Global, Module } from "@nestjs/common";

import { CLOCK, ID_GENERATOR, systemClock, uuidV7Generator } from "./runtime.js";

@Global()
@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: ID_GENERATOR, useValue: uuidV7Generator },
  ],
  exports: [CLOCK, ID_GENERATOR],
})
export class RuntimeModule {}
