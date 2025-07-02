/**
 * This can be used to branch functionality between "dev" and "prod" modes, so that our
 * library can omit doing unnecessary work once it's out in the wild
 *
 * Even though the value of this constant uses Node.js specific APIs, pretty much every
 * bundler replaces the expression below with either `development` or `production`
 */
// biome-ignore lint/suspicious/noExplicitAny: the types are not important here
export const DEV = (globalThis as any).process.env.NODE_ENV === 'development';

// biome-ignore lint/suspicious/noExplicitAny: the types are not important here
export const TEST = (globalThis as any).process.env.NODE_ENV === 'test';

/**
 * Performance measurements are only enabled in dev & test environments for now
 */
export const PERF = (DEV || TEST)
  ? ({
    get value() {
      // biome-ignore lint/suspicious/noExplicitAny: it might be there!
      return !!(globalThis as any).__TYPEGPU_MEASURE_PERF__;
    },
  })
  : undefined;
