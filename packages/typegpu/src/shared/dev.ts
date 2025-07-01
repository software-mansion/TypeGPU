/**
 * This can be used to branch functionality between "dev" and "prod" modes, so that our
 * library can omit doing unnecessary work once it's out in the wild
 *
 * Even though the value of this constant uses Node.js specific APIs, pretty much every
 * bundler replaces the expression below with either `development` or `production`
 */
// biome-ignore lint/suspicious/noExplicitAny: the types are not important here
export const DEV = (globalThis as any).process.env.NODE_ENV === 'development';

/**
 * Performance measurements are only enabled in dev & test environments for now
 */
// biome-ignore lint/suspicious/noExplicitAny: the types are not important here
export const PERF = DEV || (globalThis as any).process.env.NODE_ENV === 'test';
