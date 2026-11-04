// Stubs throw this until their owner builds them (T016). Callers can test `code`.
export class NotImplementedError extends Error {
  readonly code = 'not_implemented';
  constructor(what: string) {
    super(`not_implemented: ${what}`);
    this.name = 'NotImplementedError';
  }
}

export function notImplemented(what: string): never {
  throw new NotImplementedError(what);
}
