import type { IndexedGeometry } from './geometry.ts';
import * as patches from './patches/index.ts';
import { tessellate } from './triangles.ts';

export interface TessellationOptions {
  /** Segments along each edge of every triangular patch. Default 4 */
  segments?: number;
}

export function icosphere({
  segments = 4,
  ...options
}: patches.IcosphereOptions & TessellationOptions = {}): IndexedGeometry {
  return tessellate(patches.icosphere(options), segments);
}

export function capsule({
  segments = 4,
  ...options
}: patches.CapsuleOptions & TessellationOptions = {}): IndexedGeometry {
  return tessellate(patches.capsule(options), segments);
}

export function roundedBox({
  segments = 4,
  ...options
}: patches.RoundedBoxOptions & TessellationOptions = {}): IndexedGeometry {
  return tessellate(patches.roundedBox(options), segments);
}
