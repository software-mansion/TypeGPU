export * from './bake.ts';
export { attach, concat, map, transform, unindexed } from './combinators.ts';
export type { Attached, Placed } from './combinators.ts';
export { isIndexed, Surface } from './geometry.ts';
export type { ConstructibleSchema, Geometry, IndexedGeometry, Topology } from './geometry.ts';
export { parametric } from './parametric.ts';
export type { Parametric, ParametricOptions } from './parametric.ts';
export * from './primitives.ts';
export {
  decode,
  encode,
  OctahedralSurface,
  octahedralDecode,
  octahedralEncode,
  octahedralSurface,
  octahedralSurfaceAttribs,
} from './representation.ts';
export type { Representation } from './representation.ts';
