/// <reference types="node" />

/**
 * This can be used to branch functionality between "dev" and "prod" modes, so that our
 * library can omit doing unnecessary work once it's out in the wild.
 *
 * `true` when running in development or in tests, since tests should exercise the same
 * checks and warnings that developers see.
 *
 * Even though the value of this constant uses Node.js specific APIs, pretty much every
 * bundler replaces `process.env.NODE_ENV` with either `development` or `production`
 */
export const DEV = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

/**
 * `true` only when running in tests. Prefer `DEV` unless the behavior is specific to tests.
 */
export const TEST = process.env.NODE_ENV === 'test';
