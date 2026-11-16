export { computeJunctionGradient, getJunctionGradientSlot, sample } from './algorithm.ts';
export {
  cacheMemoryAccess,
  cacheSizeAccess,
  getCachedJunctionGradient,
} from './dynamic-cache/shader.ts';
export * as dynamicCache from './dynamic-cache/index.ts';
export {
  dynamicCacheConfig,
  type DynamicPerlin3DCache,
  type DynamicPerlin3DCacheConfig,
} from './dynamic-cache-legacy.ts';
export type {
  Perlin3DStaticCacheDefinition,
  Perlin3DStaticCacheInstance,
  Perlin3DStaticCacheIo,
  Perlin3DStaticCacheOptions,
} from './static-cache/index.ts';
export {
  staticCache,
  type Perlin3DStaticCacheModule,
  type StaticPerlin3DCache,
} from './static-cache-legacy.ts';
