import { v7 as uuidv7 } from "uuid";

/** Current time. Injected so use cases and tests control it (docs/ARCHITECTURE.md). */
export interface Clock {
  now(): Date;
}

/** Primary-key generator: UUID v7, time-ordered (docs/DATA_MODEL.md#convenções). */
export interface IdGenerator {
  next(): string;
}

export const CLOCK = Symbol("CLOCK");
export const ID_GENERATOR = Symbol("ID_GENERATOR");

export const systemClock: Clock = { now: () => new Date() };

export const uuidV7Generator: IdGenerator = { next: () => uuidv7() };
