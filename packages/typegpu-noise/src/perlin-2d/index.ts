export {
  computeJunctionGradient,
  getJunctionGradientSlot,
  sample,
  sampleWithGradient,
} from './algorithm.ts';
export {
  cacheMemoryAccess,
  cacheSizeAccess,
  getCachedJunctionGradient,
} from './dynamic-cache/shader.ts';
export * as dynamicCache from './dynamic-cache/index.ts';
export {
  dynamicCacheConfig,
  type DynamicPerlin2DCache,
  type DynamicPerlin2DCacheConfig,
} from './dynamic-cache-legacy.ts';
export type {
  Perlin2DStaticCacheDefinition,
  Perlin2DStaticCacheInstance,
  Perlin2DStaticCacheIo,
  Perlin2DStaticCacheOptions,
} from './static-cache/index.ts';
export {
  staticCache,
  type Perlin2DStaticCacheModule,
  type StaticPerlin2DCache,
} from './static-cache-legacy.ts';
