// Local test doubles for other lanes' functions that are still stubs (lane brief: never
// implement another lane's function; use a double in your own test folder).
//
// Each double is wired with realOrFake: the real function runs, and only while it throws
// not_implemented does the double answer. So when W1-W3 merge, these tests run on the real
// implementations without a change here.
// TODO(merge W1, W2, W3): once every stub is built, the fakes never answer; delete this folder's
// fakes and the vi.mock lines in the tests.
//
// Doubles must not import @petal/core, @petal/inputs or @petal/near at run time (those modules
// are being mocked when the doubles load): they get the real modules as arguments instead.

const isNotImplemented = (e: unknown) =>
  typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'not_implemented';

// biome-ignore lint/suspicious/noExplicitAny: wraps any function
export function realOrFake<F extends (...args: any[]) => any>(real: F, fake: F): F {
  return ((...args: Parameters<F>) => {
    try {
      const out = real(...args);
      if (out instanceof Promise) {
        return out.catch((e: unknown) => {
          if (isNotImplemented(e)) return fake(...args);
          throw e;
        });
      }
      return out;
    } catch (e) {
      if (isNotImplemented(e)) return fake(...args);
      throw e;
    }
  }) as F;
}

/** realOrFake for every method of an object of functions. */
// biome-ignore lint/suspicious/noExplicitAny: wraps any functions
export function realOrFakeAll<T extends Record<string, (...args: any[]) => any>>(
  real: T,
  fake: T,
): T {
  const out = {} as T;
  for (const k of Object.keys(fake) as (keyof T)[]) out[k] = realOrFake(real[k], fake[k]);
  return out;
}
