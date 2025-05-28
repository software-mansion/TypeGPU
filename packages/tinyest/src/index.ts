/**
 * Each breaking change to the format requires a bump to this number.
 * It's used at runtime by `typegpu` to determine how to interpret
 * a function's AST. It gets embedded by `unplugin-typegpu` into
 * the source code at build time.
 */
export const FORMAT_VERSION = 1;

export * from './nodes.ts';
