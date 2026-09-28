/// <reference types="node" />

/**
 * Whether we're in a development build. Bundlers replace `process.env.NODE_ENV` with a literal,
 * so dev-only work can be dropped from production builds.
 *
 * It's a function rather than a constant so tests can stub the environment.
 */
export const isDev = () => process.env.NODE_ENV === 'development';
