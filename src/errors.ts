export class MidasApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MidasApiError";
  }
}
