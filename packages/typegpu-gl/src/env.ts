/// <reference types="node" />

/**
 * Whether we're in a development build. Bundlers replace `process.env.NODE_ENV` with a literal,
 * so dev-only work can be dropped from production builds.
 */
export const DEV = process.env.NODE_ENV === 'development';
