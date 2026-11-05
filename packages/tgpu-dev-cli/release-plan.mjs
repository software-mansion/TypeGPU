// @ts-check

import { execa } from 'execa';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getChangedFiles, resolveBase } from './changed-files.mjs';

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

/**
 * @typedef {'needs-release' | 'new' | 'already-bumped' | 'non-source-only' | 'private'} ReleaseStatus
 *
 * @typedef {Object} PackageChange
 * @prop {string} name
 * @prop {string} dirname Directory name inside `packages/`.
 * @prop {string} dir Absolute path to the package's directory.
 * @prop {boolean} private
 * @prop {string} version The version on `head`.
 * @prop {string | undefined} releasedVersion The version on `base`, `undefined` if the package didn't exist there.
 * @prop {string | undefined} nextVersion The suggested next version (a patch bump), `undefined` for prereleases.
 * @prop {string[]} sourceFiles Changed files that end up in the published package.
 * @prop {string[]} nonSourceFiles Changed files that don't (tests, docs, configs).
 * @prop {ReleaseStatus} status
 */

/**
 * @param {string} version
 * @returns {string | undefined}
 */
export function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    // Prereleases (and anything unusual) have to be bumped by hand.
    return undefined;
  }
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

/**
 * @param {string} ref
 * @param {string} filePath
 * @returns {Promise<string | undefined>}
 */
export async function readFileAtRef(ref, filePath) {
  const { stdout, exitCode } = await execa('git', ['show', `${ref}:${filePath}`], {
    reject: false,
  });
  return exitCode === 0 ? stdout : undefined;
}

/**
 * @param {Record<string, unknown>} pkg
 */
function withoutIgnoredFields(pkg) {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(pkg).filter(([key]) => !IGNORED_PACKAGE_JSON_FIELDS.includes(key)),
    ),
  );
}

/**
 * @param {string} file Path relative to the package's directory.
 * @param {Record<string, unknown> | undefined} basePkg
 * @param {Record<string, unknown>} headPkg
 */
function isSourceFile(file, basePkg, headPkg) {
  if (file === 'package.json') {
    return !basePkg || withoutIgnoredFields(basePkg) !== withoutIgnoredFields(headPkg);
  }
  return !NON_SOURCE_PATTERNS.some((pattern) => pattern.test(file));
}

/**
 * Figures out which packages changed on `head` since it diverged from `base`, and which
 * of them need a release.
 *
 * @param {{ base?: string, head?: string, repoRoot?: string }=} options `base` defaults to the latest release tag.
 * @returns {Promise<PackageChange[]>}
 */
export async function getReleasePlan({ base: baseOption, head = 'HEAD', repoRoot } = {}) {
  const base = await resolveBase(baseOption);
  const root = repoRoot ?? (await execa('git', ['rev-parse', '--show-toplevel'])).stdout;
  const files = await getChangedFiles({ base, head });

  /** @type {Map<string, string[]>} */
  const filesByDirname = new Map();
  for (const file of files) {
    const match = /^packages\/([@\w-]+)\/(.+)$/.exec(file);
    if (!match) {
      continue;
    }
    const [, dirname, rest] = match;
    filesByDirname.set(dirname, [...(filesByDirname.get(dirname) ?? []), rest]);
  }

  const changes = await Promise.all(
    [...filesByDirname].map(async ([dirname, packageFiles]) => {
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

      /** @type {ReleaseStatus} */
      let status;
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

      /** @type {PackageChange} */
      const change = {
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
      return change;
    }),
  );

  return changes
    .filter((change) => change !== undefined)
    .toSorted((a, b) => a.name.localeCompare(b.name));
}
