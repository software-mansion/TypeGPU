import arg from 'arg';
import { $ } from 'bun';
import { consola } from 'consola';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { resolveBase } from './changed-files.ts';
import colors from './colors.ts';
import { bumpVersion, getReleasePlan, isPublished, readFileAtRef } from './release-plan.ts';

/**
 * Packages that read the versions of the other public packages when they're built
 * (see `packages/typegpu-cli/tsdown.config.ts`), so they have to be released
 * whenever any other package is, to scaffold projects with the latest versions.
 */
const RELEASED_WITH_ANY_PACKAGE = ['@typegpu/cli'];

/**
 * The package whose version names the bump PR (`bump: typegpu 0.12.10 (+more)`).
 * In a minor release, every package on the same minor line as this one
 * (e.g. 0.12.x) moves to its next minor version (e.g. 0.13.0).
 */
const MAIN_PACKAGE = 'typegpu';

/**
 * The fields of package.json that bumping cares about.
 */
interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface WorkspacePackage {
  name: string;
  dirname: string;
  packageJsonPath: string;
  /** Contents of package.json */
  source: string;
  json: PackageJson;
}

interface Bump {
  pkg: WorkspacePackage;
  from: string;
  to: string;
  reason: string;
}

async function readWorkspacePackages(root: string): Promise<WorkspacePackage[]> {
  const packagesDir = path.join(root, 'packages');
  const entries = await fs.readdir(packagesDir, { withFileTypes: true });

  const packages = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<WorkspacePackage | undefined> => {
        const packageJsonPath = path.join(packagesDir, entry.name, 'package.json');
        const source = await fs.readFile(packageJsonPath, 'utf-8').catch(() => undefined);
        if (source === undefined) {
          return undefined;
        }
        const json: PackageJson = JSON.parse(source);
        return {
          name: json.name,
          dirname: entry.name,
          packageJsonPath,
          source,
          json,
        };
      }),
  );

  return packages.filter((pkg) => pkg !== undefined);
}

/**
 * The range `pkg` requires `depName` with, if it would no longer match after a `kind` bump of `depName`.
 *
 * `workspace:` and `workspace:*` are published as the exact current version, so any bump breaks them.
 * `workspace:^` and `workspace:~` are published as `^x.y.z` and `~x.y.z`, which (with every package
 * still on 0.x) don't span minor versions, so a minor bump breaks them too.
 */
function getOutdatedRange(
  pkg: WorkspacePackage,
  depName: string,
  kind: 'patch' | 'minor',
): string | undefined {
  const outdated =
    kind === 'minor'
      ? (spec: string) => spec.startsWith('workspace:')
      : (spec: string) => spec === 'workspace:' || spec === 'workspace:*';
  return [pkg.json.dependencies, pkg.json.peerDependencies, pkg.json.optionalDependencies]
    .map((deps) => deps?.[depName])
    .find((spec) => spec !== undefined && outdated(spec));
}

async function main() {
  const args = arg(
    {
      '--base': String,
      '--skip': [String],
      '--dry-run': Boolean,
      '--patch': Boolean,
      '--minor': Boolean,
    },
    { permissive: true },
  );

  if (Boolean(args['--patch']) === Boolean(args['--minor'])) {
    consola.error('Pass either --patch or --minor, to say what kind of release this is.');
    process.exitCode = 1;
    return;
  }
  const kind: 'patch' | 'minor' = args['--minor'] ? 'minor' : 'patch';

  const base = await resolveBase(args['--base']);
  const skip = args['--skip'] ?? [];
  const dryRun = args['--dry-run'] ?? false;

  const root = (await $`git rev-parse --show-toplevel`.text()).trim();

  consola.start(`Planning ${kind} version bumps for changes since '${base}'...`);
  consola.log('');

  const plan = await getReleasePlan({ base, head: 'HEAD', repoRoot: root });
  const packages = await readWorkspacePackages(root);
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));

  const bumps = new Map<string, Bump>();

  for (const change of plan) {
    if (change.status !== 'needs-release' || skip.includes(change.name)) {
      continue;
    }
    const pkg = byName.get(change.name);
    if (!pkg) {
      continue;
    }
    const to = bumpVersion(change.version, kind);
    if (!to) {
      consola.warn(`${change.name}@${change.version} is a prerelease, bump it by hand.`);
      continue;
    }
    bumps.set(change.name, {
      pkg,
      from: change.version,
      to,
      reason: `${change.sourceFiles.length} source file(s) changed`,
    });
  }

  /**
   * @returns The version of `pkg` at `base`.
   */
  async function getReleasedVersion(pkg: WorkspacePackage): Promise<string | undefined> {
    const baseSource = await readFileAtRef(base, `packages/${pkg.dirname}/package.json`);
    return baseSource ? JSON.parse(baseSource).version : undefined;
  }

  /**
   * Whether the current version of `pkg` is still waiting to be published, because it was bumped
   * by hand or in an earlier run, or because `pkg` is a new package.
   */
  async function isUnreleased(pkg: WorkspacePackage) {
    const published = await isPublished(pkg.name, pkg.json.version);
    if (published === undefined) {
      // Couldn't reach npm
      return (await getReleasedVersion(pkg)) !== pkg.json.version;
    }
    return !published;
  }

  const unreleased = (
    await Promise.all(
      packages
        .filter((pkg) => !pkg.json.private)
        .map(async (pkg) => ((await isUnreleased(pkg)) ? pkg : undefined)),
    )
  ).filter((pkg) => pkg !== undefined);
  const unreleasedNames = new Set(unreleased.map((pkg) => pkg.name));

  /**
   * A minor release moves every public package on the main package's minor line
   * (e.g. 0.12.x) to the next minor version (e.g. 0.13.0), changed or not, so the
   * ecosystem stays aligned. Packages with their own version line (e.g. `tinyest`)
   * are left to the usual rules.
   */
  async function alignWithMainPackage() {
    const mainPkg = byName.get(MAIN_PACKAGE);
    const mainReleased = mainPkg && (await getReleasedVersion(mainPkg));
    const target = mainReleased && bumpVersion(mainReleased, 'minor');
    if (!mainReleased || !target) {
      consola.warn(
        `Can't align packages with ${MAIN_PACKAGE}@${mainReleased ?? '?'}, bump them by hand.`,
      );
      return;
    }
    const line = mainReleased.split('.').slice(0, 2).join('.');

    for (const pkg of packages) {
      if (pkg.json.private || skip.includes(pkg.name)) {
        continue;
      }
      const released = await getReleasedVersion(pkg);
      if (!released || released.split('.').slice(0, 2).join('.') !== line) {
        continue;
      }
      if (pkg.json.version === target) {
        // Already aligned in an earlier run
        continue;
      }
      const reason = bumps.get(pkg.name)?.reason;
      bumps.set(pkg.name, {
        pkg,
        from: pkg.json.version,
        to: target,
        reason:
          reason ??
          (pkg.name === MAIN_PACKAGE ? 'minor release' : `aligned with ${MAIN_PACKAGE} ${target}`),
      });
    }
  }

  /**
   * Adds a bump of the same kind for `pkg`, unless it is private, skipped, a prerelease,
   * or its current version wasn't published yet.
   */
  function addDependentBump(pkg: WorkspacePackage, reason: string) {
    if (
      bumps.has(pkg.name) ||
      unreleasedNames.has(pkg.name) ||
      pkg.json.private ||
      skip.includes(pkg.name)
    ) {
      return false;
    }
    const to = bumpVersion(pkg.json.version, kind);
    if (!to) {
      consola.warn(`${pkg.name}@${pkg.json.version} is a prerelease, bump it by hand.`);
      return false;
    }
    bumps.set(pkg.name, { pkg, from: pkg.json.version, to, reason });
    return true;
  }

  if (kind === 'minor') {
    await alignWithMainPackage();
  }

  // Packages whose range of one of the released packages (including ones bumped earlier) wouldn't
  // match the new version have to be released along with it, otherwise they'd conflict with it.
  // Repeating until nothing changes, since these bumps can cascade.
  let changed = true;
  while (changed) {
    changed = false;
    for (const pkg of packages) {
      for (const releasedName of [...bumps.keys(), ...unreleasedNames]) {
        const range = getOutdatedRange(pkg, releasedName, kind);
        if (range === 'workspace:' || range === 'workspace:*') {
          changed ||= addDependentBump(pkg, `pins ${releasedName} exactly`);
        } else if (range) {
          changed ||= addDependentBump(pkg, `requires ${releasedName}@${range}`);
        }
      }
    }
  }

  const releasesAnyPackage = [...bumps.keys(), ...unreleasedNames].some(
    (name) => !RELEASED_WITH_ANY_PACKAGE.includes(name),
  );
  if (releasesAnyPackage) {
    for (const name of RELEASED_WITH_ANY_PACKAGE) {
      const pkg = byName.get(name);
      if (pkg) {
        addDependentBump(pkg, 'bakes in the versions of other packages when built');
      }
    }
  }

  if (bumps.size === 0) {
    consola.success(
      unreleased.length > 0
        ? 'Nothing more to bump, all changed packages are already bumped.'
        : 'Nothing to bump.',
    );
    return;
  }

  const sortedBumps = [...bumps.values()].toSorted((a, b) => a.pkg.name.localeCompare(b.pkg.name));
  const nameWidth = Math.max(...sortedBumps.map((bump) => bump.pkg.name.length));
  const versionWidth = Math.max(...sortedBumps.map((bump) => bump.from.length));

  consola.info(`${colors.Bold}${dryRun ? 'Would bump' : 'Bumping'}:${colors.Reset}`);
  for (const { pkg, from, to, reason } of sortedBumps) {
    consola.log(
      `  ${pkg.name.padEnd(nameWidth)}  ${from.padEnd(versionWidth)} → ${colors.Green}${to}${colors.Reset}  ${colors.BrightBlack}(${reason})${colors.Reset}`,
    );
  }
  consola.log('');

  if (skip.length > 0) {
    consola.info(`Skipped on request: ${skip.join(', ')}`);
    consola.log('');
  }

  if (!dryRun) {
    for (const { pkg, from, to } of sortedBumps) {
      const versionField = `"version": "${from}"`;
      if (!pkg.source.includes(versionField)) {
        throw new Error(`Could not find ${versionField} in ${pkg.packageJsonPath}`);
      }
      await fs.writeFile(
        pkg.packageJsonPath,
        pkg.source.replace(versionField, `"version": "${to}"`),
      );
    }
  }

  // Everything released in this cycle, including packages bumped earlier and new packages
  const released = [
    ...sortedBumps.map(({ pkg, to }) => ({ name: pkg.name, version: to })),
    ...unreleased
      .filter((pkg) => !bumps.has(pkg.name))
      .map((pkg) => ({ name: pkg.name, version: pkg.json.version })),
  ].toSorted((a, b) => {
    // The main package first, then by name
    if (a.name === MAIN_PACKAGE) return -1;
    if (b.name === MAIN_PACKAGE) return 1;
    return a.name.localeCompare(b.name);
  });

  const [first] = released;
  if (!first) {
    // Unreachable, since there's at least one bump at this point
    return;
  }
  const title = `bump: ${first.name} ${first.version}${released.length > 1 ? ' (+more)' : ''}`;

  consola.info(`${colors.Bold}Suggested PR title:${colors.Reset}`);
  consola.log(`  ${title}`);
  consola.log('');
  consola.info(`${colors.Bold}Released packages (for the PR description):${colors.Reset}`);
  // Plain console.log, since consola would format the markdown
  console.log('Released packages:');
  for (const { name, version } of released) {
    console.log(`- \`${name}\` v${version}`);
  }
  consola.log('');

  if (dryRun) {
    consola.info('Dry run, no files were changed.');
  } else {
    consola.success(`Bumped ${sortedBumps.length} package(s).`);
  }
}

export default main;
