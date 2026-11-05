import { $ } from 'bun';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getChangedFiles, resolveBase } from './changed-files.ts';

/**
 * Files that don't end up in a published package (or don't change how it behaves),
 * so changing only them doesn't call for a release. Matched against paths relative
 * to the package's directory.
 */
const NON_SOURCE_PATTERNS = [
  /(^|\/)(tests?|__tests__|docs)\//,
  /\.(test|spec|bench)\.[cm]?[jt]sx?$/,
  /^vitest(\.\w+)*\.config\.[cm]?[jt]s$/,
  /^setupVitest\.[cm]?[jt]s$/,
  /^tsconfig\.json$/,
  /\.md$/i,
];

/**
 * Fields of package.json that don't affect the published package's behavior.
 * `version` is compared separately, to tell whether a package was already bumped.
 */
const IGNORED_PACKAGE_JSON_FIELDS = ['version', 'devDependencies'];

export type ReleaseStatus =
  | 'needs-release'
  | 'new'
  | 'already-bumped'
  | 'non-source-only'
  | 'private';

export interface PackageChange {
  name: string;
  /** Directory name inside `packages/`. */
  dirname: string;
  /** Absolute path to the package's directory. */
  dir: string;
  private: boolean;
  /** The version on `head`. */
  version: string;
  /** The version on `base`, `undefined` if the package didn't exist there. */
  releasedVersion: string | undefined;
  /** The suggested next version (a patch bump), `undefined` for prereleases. */
  nextVersion: string | undefined;
  /** Changed files that end up in the published package. */
  sourceFiles: string[];
  /** Changed files that don't (tests, docs, configs). */
  nonSourceFiles: string[];
  status: ReleaseStatus;
}

export interface ReleasePlanOptions {
  /** Defaults to the latest release tag. */
  base?: string | undefined;
  head?: string | undefined;
  repoRoot?: string | undefined;
}

export function bumpPatch(version: string): string | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    // Prereleases (and anything unusual) have to be bumped by hand.
    return undefined;
  }
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

async function readFileAtRef(ref: string, filePath: string): Promise<string | undefined> {
  const { stdout, exitCode } = await $`git show ${`${ref}:${filePath}`}`.nothrow().quiet();
  return exitCode === 0 ? stdout.toString() : undefined;
}

function withoutIgnoredFields(pkg: Record<string, unknown>) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(pkg).filter(([key]) => !IGNORED_PACKAGE_JSON_FIELDS.includes(key)),
    ),
  );
}

/**
 * @param file Path relative to the package's directory.
 */
function isSourceFile(
  file: string,
  basePkg: Record<string, unknown> | undefined,
  headPkg: Record<string, unknown>,
) {
  if (file === 'package.json') {
    return !basePkg || withoutIgnoredFields(basePkg) !== withoutIgnoredFields(headPkg);
  }
  return !NON_SOURCE_PATTERNS.some((pattern) => pattern.test(file));
}

/**
 * Figures out which packages changed on `head` since it diverged from `base`, and which
 * of them need a release.
 */
export async function getReleasePlan({
  base: baseOption,
  head = 'HEAD',
  repoRoot,
}: ReleasePlanOptions = {}): Promise<PackageChange[]> {
  const base = await resolveBase(baseOption);
  const root = repoRoot ?? (await $`git rev-parse --show-toplevel`.text()).trim();
  const files = await getChangedFiles({ base, head });

  const filesByDirname = new Map<string, string[]>();
  for (const file of files) {
    const [, dirname, rest] = /^packages\/([@\w-]+)\/(.+)$/.exec(file) ?? [];
    if (!dirname || !rest) {
      continue;
    }
    filesByDirname.set(dirname, [...(filesByDirname.get(dirname) ?? []), rest]);
  }

  const changes = await Promise.all(
    [...filesByDirname].map(async ([dirname, packageFiles]): Promise<PackageChange | undefined> => {
      const packageJsonPath = `packages/${dirname}/package.json`;
      const headSource =
        head === 'HEAD'
          ? await fs.readFile(path.join(root, packageJsonPath), 'utf-8').catch(() => undefined)
          : await readFileAtRef(head, packageJsonPath);

      if (headSource === undefined) {
        // The package was removed (or isn't a package)
        return undefined;
      }

      const baseSource = await readFileAtRef(base, packageJsonPath);
      const headPkg = JSON.parse(headSource);
      const basePkg = baseSource === undefined ? undefined : JSON.parse(baseSource);

      const sourceFiles = packageFiles.filter((file) => isSourceFile(file, basePkg, headPkg));
      const nonSourceFiles = packageFiles.filter((file) => !sourceFiles.includes(file));

      let status: ReleaseStatus;
      if (headPkg.private) {
        status = 'private';
      } else if (!basePkg) {
        // Not released yet, so the version in package.json is the first one to publish
        status = 'new';
      } else if (basePkg && basePkg.version !== headPkg.version) {
        status = 'already-bumped';
      } else if (sourceFiles.length === 0) {
        status = 'non-source-only';
      } else {
        status = 'needs-release';
      }

      return {
        name: headPkg.name,
        dirname,
        dir: path.join(root, 'packages', dirname),
        private: headPkg.private ?? false,
        version: headPkg.version,
        releasedVersion: basePkg?.version,
        nextVersion: status === 'needs-release' ? bumpPatch(headPkg.version) : undefined,
        sourceFiles,
        nonSourceFiles,
        status,
      };
    }),
  );

  return changes
    .filter((change) => change !== undefined)
    .toSorted((a, b) => a.name.localeCompare(b.name));
}
