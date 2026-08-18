import { $ } from 'bun';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PACKAGES_DIR = join(import.meta.dir, '../packages');

interface PackageJson {
  name: string;
  private?: boolean;
  version: string;
}

export function getPackages() {
  const packageDirNames = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => {
      return existsSync(join(PACKAGES_DIR, name, 'package.json'));
    });

  return Promise.all(
    packageDirNames.map(async (dirname): Promise<PackageInfo> => {
      const dir = join(PACKAGES_DIR, dirname);
      const pkg: PackageJson = await Bun.file(join(dir, 'package.json')).json();

      return {
        dir,
        dirname,
        name: pkg.name,
        version: pkg.version,
        private: pkg.private ?? false,
      };
    }),
  );
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
}
