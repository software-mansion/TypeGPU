export {
  computeJunctionGradient,
  getJunctionGradientSlot,
  sample,
  sampleWithGradient,
} from './algorithm.ts';
export { cacheMemoryAccess, cacheSizeAccess, getCachedJunctionGradient } from './cache/shader.ts';
export * as cache from './cache/index.ts';
export {
  dynamicCacheConfig,
  type DynamicPerlin2DCache,
  type DynamicPerlin2DCacheConfig,
} from './dynamic-cache.ts';
export { staticCache, type StaticPerlin2DCache } from './static-cache.ts';
