import { $internal } from '../shared/symbols.ts';
import type { WgslStorageTexture, WgslTexture } from './texture.ts';

/**
 * Texture guards live in this leaf so `schemasEqualCore.ts` can use them
 * without importing `texture.ts`, which would close a cycle back to
 * `conversion.ts`. The type import above is erased at runtime.
 */
export function isWgslTexture(value: unknown): value is WgslTexture {
  return (
    !!(value as WgslTexture)[$internal] && typeof (value as WgslTexture).multisampled === 'boolean'
  );
}

export function isWgslStorageTexture(value: unknown): value is WgslStorageTexture {
  return (
    !!(value as WgslStorageTexture)[$internal] &&
    typeof (value as WgslStorageTexture).format === 'string' &&
    typeof (value as WgslStorageTexture).access === 'string'
  );
}
