import * as patches from './patches/index.ts';
import { tessellate } from './triangles.ts';

export function icosphere({
  segments = 4,
  ...options
}: patches.IcosphereOptions & { segments?: number } = {}) {
  return tessellate(patches.icosphere(options), segments);
}

export function capsule({
  segments = 4,
  ...options
}: patches.CapsuleOptions & { segments?: number } = {}) {
  return tessellate(patches.capsule(options), segments);
}

export function roundedBox({
  segments = 4,
  ...options
}: patches.RoundedBoxOptions & { segments?: number } = {}) {
  return tessellate(patches.roundedBox(options), segments);
}
