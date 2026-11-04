// A push-to-pull queue: a producer pushes, one consumer pulls with for-await. return() (a consumer
// that stops early) calls onReturn and drops what was left.
export class Channel<T> implements AsyncIterableIterator<T> {
  #buf: T[] = [];
  #waiting: ((r: IteratorResult<T>) => void)[] = [];
  #closed = false;
  onReturn: () => void = () => {};

  get closed(): boolean {
    return this.#closed;
  }

  push(v: T): void {
    if (this.#closed) return;
    const w = this.#waiting.shift();
    if (w) w({ value: v, done: false });
    else this.#buf.push(v);
  }

  /** No more values; what is buffered is still delivered. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const w of this.#waiting.splice(0)) w({ value: undefined, done: true });
  }

  next(): Promise<IteratorResult<T>> {
    if (this.#buf.length) return Promise.resolve({ value: this.#buf.shift() as T, done: false });
    if (this.#closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((r) => this.#waiting.push(r));
  }

  async return(): Promise<IteratorResult<T>> {
    this.onReturn();
    this.#buf = [];
    this.close();
    return { value: undefined, done: true };
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }
}
