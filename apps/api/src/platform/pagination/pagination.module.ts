import { Global, Module } from "@nestjs/common";

import { CursorCodec } from "./cursor-codec.js";

@Global()
@Module({ providers: [CursorCodec], exports: [CursorCodec] })
export class PaginationModule {}
