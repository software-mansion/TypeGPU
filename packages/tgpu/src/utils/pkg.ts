import type { PackageJsonWithDeps } from './types.ts';

export function hasDependency(pkg: PackageJsonWithDeps, name: string) {
  const deps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};
  const peerDeps = pkg.peerDependencies ?? {};
  return name in deps || name in devDeps || name in peerDeps;
}

export function isExpoProject(pkg: PackageJsonWithDeps) {
  return hasDependency(pkg, 'expo');
}
