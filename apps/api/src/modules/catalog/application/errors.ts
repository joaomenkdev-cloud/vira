/** No published event with that slug (a draft looks the same as nothing). */
export class CatalogEventNotFoundError extends Error {
  constructor() {
    super("Event not found");
    this.name = "CatalogEventNotFoundError";
  }
}
