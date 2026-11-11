export { computeJunctionGradient, getJunctionGradientSlot, sample } from './algorithm.ts';
export { cacheMemoryAccess, cacheSizeAccess, getCachedJunctionGradient } from './cache/shader.ts';
export * as cache from './cache/index.ts';
export {
  dynamicCacheConfig,
  type DynamicPerlin3DCache,
  type DynamicPerlin3DCacheConfig,
} from './dynamic-cache.ts';
export { staticCache, type StaticPerlin3DCache } from './static-cache.ts';
