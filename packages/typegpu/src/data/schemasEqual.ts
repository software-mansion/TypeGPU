import { comptime } from '../core/function/comptime.ts';
import type { AnyData } from './dataTypes.ts';
import { schemasEqual } from './schemasEqualCore.ts';

/**
 * Performs a structural comparison of two TypeGPU data schemas. This
 * means two struct definitions are considered equal when they have the
 * same properties. Use `schemasEqualNominally` for a nominal comparison.
 *
 * @param a The first data schema to compare.
 * @param b The second data schema to compare.
 * @returns `true` if the schemas are structurally equal, `false` otherwise.
 *
 * @example
 * import { vec3f, struct, schemasEqualStructurally } from 'typegpu/data';
 *
 * console.log(schemasEqualStructurally(struct({ a: vec3f }), struct({ a: vec3f }))); // true
 * console.log(schemasEqualStructurally(struct({ a: vec3f }), struct({ b: vec3f }))); // false
 */
export const schemasEqualStructurally = comptime((a: AnyData, b: AnyData): boolean =>
  schemasEqual(a, b, true),
).$name('schemasEqualStructurally');

/**
 * Performs a nominal comparison of two TypeGPU data schemas. This
 * means two struct definitions are only considered equal when they
 * have the same object identity. Use `schemasEqualStructurally` for
 * a structural comparison.
 *
 * @param a The first data schema to compare.
 * @param b The second data schema to compare.
 * @returns `true` if the schemas are nominally equal, `false` otherwise.
 *
 * @example
 * import { vec3f, struct, schemasEqualNominally } from 'typegpu/data';
 *
 * const struct1 = struct({ a: vec3f });
 * const struct2 = struct({ a: vec3f });
 *
 * console.log(schemasEqualNominally(d.arrayOf(struct1, 2), d.arrayOf(struct1, 2))); // true
 * console.log(schemasEqualNominally(struct1, struct2)); // false
 */
export const schemasEqualNominally = comptime((a: AnyData, b: AnyData): boolean =>
  schemasEqual(a, b, false),
).$name('schemasEqualNominally');
