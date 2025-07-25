/**
 * This can be used to branch functionality between "dev" and "prod" modes, so that our
 * library can omit doing unnecessary work once it's out in the wild
 *
 * Even though the value of this constant uses Node.js specific APIs, pretty much every
 * bundler replaces the expression below with either `development` or `production`
 */
export const DEV = globalThis.process.env.NODE_ENV === 'development';

export const TEST = globalThis.process.env.NODE_ENV === 'test';
