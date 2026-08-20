export const MODEL_SIZES = ['small', 'base', 'large'] as const;
export type ModelSize = (typeof MODEL_SIZES)[number];

export interface ModelVariant {
  readonly bundle: string;
  readonly megabytes: number;
}

/** Sizes resolve to their FP16 bundle, or the FP32 one when shader-f16 is unavailable */
const MODEL_VARIANTS: Record<
  ModelSize,
  { readonly fp16: ModelVariant; readonly f32?: ModelVariant }
> = {
  small: {
    fp16: { bundle: 'depthart-relative-s-448-balanced', megabytes: 13 },
    f32: { bundle: 'depthart-relative-s-448-f32', megabytes: 23 },
  },
  base: {
    fp16: { bundle: 'depthart-relative-b-448-balanced', megabytes: 24 },
    f32: { bundle: 'depthart-relative-b-448-f32', megabytes: 43 },
  },
  large: {
    fp16: { bundle: 'depthart-relative-l-448-balanced', megabytes: 68 },
  },
};

export const RECOMMENDED_MODEL: ModelSize = 'small';

const MODEL_HOST =
  'https://huggingface.co/reczkok/depthart-typegpu/resolve/913a7c13ddfbd48549279555d1db98172e8e5e0d';
const MODEL_CACHE = 'depthart-models';
const CACHE_OPT_OUT_KEY = 'depthart-cache-disabled';

export function modelVariant(size: ModelSize, hasShaderF16: boolean): ModelVariant | undefined {
  const variants = MODEL_VARIANTS[size];
  return hasShaderF16 ? variants.fp16 : variants.f32;
}

export function modelLabel(size: ModelSize, variant: ModelVariant): string {
  return `${size} · ${variant.megabytes} MB`;
}

export function modelUrl(variant: ModelVariant): string {
  return `${MODEL_HOST}/${variant.bundle}.depthart`;
}

export function cachingEnabled(): boolean {
  try {
    return localStorage.getItem(CACHE_OPT_OUT_KEY) === null;
  } catch {
    return true;
  }
}

export function setCachingEnabled(enabled: boolean): void {
  try {
    if (enabled) {
      localStorage.removeItem(CACHE_OPT_OUT_KEY);
    } else {
      localStorage.setItem(CACHE_OPT_OUT_KEY, '1');
    }
  } catch {
    // private-mode storage denial is fine to ignore
  }
}

export async function fetchModel(variant: ModelVariant, signal: AbortSignal): Promise<ArrayBuffer> {
  const url = modelUrl(variant);
  let cache: Cache | undefined;
  try {
    cache = await caches.open(MODEL_CACHE);
    const hit = await cache.match(url);
    if (hit) {
      return await hit.arrayBuffer();
    }
  } catch {
    cache = undefined;
  }
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Model download failed (${response.status}).`);
  }
  if (cache && cachingEnabled()) {
    const bytes = await response.clone().arrayBuffer();
    await cache.put(url, response).catch(() => undefined);
    return bytes;
  }
  return await response.arrayBuffer();
}

export async function isModelCached(variant: ModelVariant): Promise<boolean> {
  try {
    const cache = await caches.open(MODEL_CACHE);
    return (await cache.match(modelUrl(variant))) !== undefined;
  } catch {
    return false;
  }
}

export async function clearDownloads(): Promise<void> {
  try {
    await caches.delete(MODEL_CACHE);
  } catch {
    // nothing to clear if Cache Storage is unavailable
  }
}
