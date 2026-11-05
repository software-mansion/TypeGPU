import type { PackageJson } from './types.ts';

export function hasDependency(pkg: PackageJson, name: string) {
  const deps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};
  const peerDeps = pkg.peerDependencies ?? {};
  return name in deps || name in devDeps || name in peerDeps;
}

declare const __WORKSPACE_PACKAGE_VERSIONS__: Record<string, string>;

/** Versions of our packages at the time the CLI was built (injected by `tsdown.config.ts`). */
const WORKSPACE_PACKAGE_VERSIONS = __WORKSPACE_PACKAGE_VERSIONS__;

/**
 * Template dependencies on our own packages use this placeholder instead of a version,
 * and get resolved to the version the CLI was built with (similar to how pnpm handles
 * `workspace:^` when publishing).
 */
const WORKSPACE_VERSION_PLACEHOLDER = 'workspace:^';

function isWorkspacePackage(name: string) {
  return Object.hasOwn(WORKSPACE_PACKAGE_VERSIONS, name);
}

/**
 * Returns the version range of one of our packages, with the version the CLI was built with
 * as the minimum. This guarantees that APIs used by the CLI and its templates are available.
 */
export function getVersionRange(name: string): string {
  if (!isWorkspacePackage(name)) {
    throw new Error(`[INTERNAL] ${name} is not a TypeGPU package.`);
  }
  return `^${WORKSPACE_PACKAGE_VERSIONS[name]}`;
}

/**
 * Replaces `workspace:^` placeholders in the template's dependencies with actual version ranges.
 * Returns the names of dependencies that could not be resolved.
 */
export function resolveWorkspaceVersions(pkg: PackageJson): string[] {
  const unresolved: string[] = [];

  for (const deps of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
    if (!deps) {
      continue;
    }

    for (const [name, spec] of Object.entries(deps)) {
      if (!spec.startsWith('workspace:')) {
        continue;
      }

      if (spec === WORKSPACE_VERSION_PLACEHOLDER && isWorkspacePackage(name)) {
        deps[name] = getVersionRange(name);
      } else {
        unresolved.push(name);
      }
    }
  }

  return unresolved;
}

export const typegpuPkgs = [
  { value: '@typegpu/color', hint: 'helpers for converting color spaces' },
  // { value: '@typegpu/geometry', hint: 'helpers for drawing points and lines' },
  {
    value: '@typegpu/noise',
    hint: 'helpers for Perlin noise and general purpose random number generation.',
  },
  { value: '@typegpu/radiance-cascades', hint: 'implementation of Radiance Cascades algorithm' },
  { value: '@typegpu/react', hint: 'React hooks for TypeGPU integration' },
  { value: '@typegpu/sdf', hint: 'helpers for creating Signed Distance Fields' },
  // { value: '@typegpu/algorithm', hint: 'implementations of scanning and sorting algorithms' },
  { value: '@typegpu/gl', hint: 'WebGL fallback, and a GLSL generator for TypeGPU functions' },
  { value: '@typegpu/three', hint: 'Three.js utilities for TypeGPU integration' },
] as const satisfies { value: string; hint: string }[];

export function appendVersion(pkg: string, version: string) {
  return `${pkg}@${version}`;
}
