import type { PackageJsonWithDeps } from './types.ts';

export function hasDependency(pkg: PackageJsonWithDeps, name: string) {
  const deps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};
  const peerDeps = pkg.peerDependencies ?? {};
  return name in deps || name in devDeps || name in peerDeps;
}

export const typegpuPkgs = [
  { value: '@typegpu/color', hint: 'helpers for converting color spaces' },
  // { value: '@typegpu/geometry', hint: 'helpers for drawing points and lines' },
  // { value: '@typegpu/gl', hint: 'WebGL utilities for TypeGPU integration' },
  {
    value: '@typegpu/noise',
    hint: 'helpers for Perlin noise and general purpose random number generation.',
  },
  { value: '@typegpu/radiance-cascades', hint: 'implementation of Radiance Cascades algorithm' },
  { value: '@typegpu/react', hint: 'React hooks for TypeGPU integration' },
  { value: '@typegpu/sdf', hint: 'helpers for creating Signed Distance Fields' },
  // { value: '@typegpu/sort', hint: 'implementations of scanning and sorting algorithms' },
  { value: '@typegpu/three', hint: 'Three.js utilities for TypeGPU integration' },
] as const satisfies { value: string; hint: string }[];
