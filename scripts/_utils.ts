import { $ } from 'bun';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES_DIR = join(import.meta.dir, '../packages');

interface PackageJson {
  name: string;
  private?: boolean;
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/**
 * Packages that read the versions of the other public packages when they're built
 * (see `packages/typegpu-cli/tsdown.config.ts`), so they have to be published last.
 * Otherwise, they could point users at versions that aren't on npm yet.
 */
const PUBLISH_LAST = new Set(['@typegpu/cli']);

export async function getPackages(): Promise<PackageInfo[]> {
  const packageDirNames = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => {
      return existsSync(join(PACKAGES_DIR, name, 'package.json'));
    });

  const manifests = await Promise.all(
    packageDirNames.map(async (dirname) => {
      const dir = join(PACKAGES_DIR, dirname);
      const pkg: PackageJson = await Bun.file(join(dir, 'package.json')).json();
      return { dir, dirname, pkg };
    }),
  );

  // Matching on names rather than on the `workspace:` protocol, so that workspace
  // packages depended on through a regular version range are taken into account too.
  const workspaceNames = new Set(manifests.map(({ pkg }) => pkg.name));

  return manifests.map(({ dir, dirname, pkg }) => {
    const workspaceDependencies = Object.keys({
      ...pkg.dependencies,
      ...pkg.peerDependencies,
      ...pkg.optionalDependencies,
    }).filter((name) => workspaceNames.has(name));

    return {
      dir,
      dirname,
      name: pkg.name,
      version: pkg.version,
      private: pkg.private ?? false,
      workspaceDependencies,
    };
  });
}

const packageNameRegex = /^packages\/([@\w-]+)\//;
export async function getPackagesChangedSinceRelease(
  packages: PackageInfo[],
): Promise<PackageInfo[]> {
  const diffMsg = await $`git diff --name-only release.. | sort`.text();
  const filesChanged = diffMsg.split('\n');

  const dirNamesOfChangedPackages = filesChanged
    .map((file) => packageNameRegex.exec(file)?.[1])
    .filter((str): str is string => !!str);

  return packages.filter((pkg) => dirNamesOfChangedPackages.includes(pkg.dirname));
}

export async function isPublished(name: string, version?: string): Promise<boolean> {
  const encodedName = encodeURIComponent(name);
  const response = await fetch(
    version
      ? `https://registry.npmjs.org/${encodedName}/${encodeURIComponent(version)}`
      : `https://registry.npmjs.org/${encodedName}`,
  );
  return response.ok;
}

export function getTag(version: string): string {
  if (version.includes('-alpha.')) return 'alpha';
  if (version.includes('-beta.')) return 'beta';
  if (version.includes('-rc.')) return 'rc';
  if (version.includes('-nightly.')) return 'nightly';
  if (!version.includes('-')) return 'latest';
  throw new Error(`Invalid version: ${version}`);
}

export interface PackageInfo {
  dir: string;
  dirname: string;
  private: boolean;
  name: string;
  version: string;
  /**
   * Names of workspace packages this package depends on at runtime
   * (`dependencies`, `peerDependencies` and `optionalDependencies`).
   */
  workspaceDependencies: string[];
}

/**
 * Orders packages so that each one comes after the workspace packages it depends on,
 * and the packages in `PUBLISH_LAST` come at the very end. Packages that don't depend
 * on each other are visited in a stable traversal order, so the result is the same on every run.
 *
 * This way, a package is never published before the versions of our packages it
 * depends on are available on npm.
 */
export function sortForPublishing<T extends PackageInfo>(packages: T[]): T[] {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const sorted: T[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(pkg: T, path: string[]) {
    if (visited.has(pkg.name)) {
      return;
    }
    if (visiting.has(pkg.name)) {
      throw new Error(`Circular dependency between packages: ${[...path, pkg.name].join(' -> ')}`);
    }

    visiting.add(pkg.name);
    for (const depName of pkg.workspaceDependencies.toSorted()) {
      const dep = byName.get(depName);
      if (dep) {
        visit(dep, [...path, pkg.name]);
      }
    }
    visiting.delete(pkg.name);
    visited.add(pkg.name);
    sorted.push(pkg);
  }

  const regular: T[] = [];
  const last: T[] = [];
  for (const pkg of packages.toSorted((a, b) => a.name.localeCompare(b.name))) {
    (PUBLISH_LAST.has(pkg.name) ? last : regular).push(pkg);
  }
  for (const pkg of [...regular, ...last]) {
    visit(pkg, []);
  }

  return sorted;
}
