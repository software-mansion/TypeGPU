// @ts-check

import arg from 'arg';
import { consola } from 'consola';
import { execa } from 'execa';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { resolveBase } from './changed-files.mjs';
import colors from './colors.mjs';
import { bumpPatch, getReleasePlan, readFileAtRef } from './release-plan.mjs';

/**
 * Packages that read the versions of the other public packages when they're built
 * (see `packages/typegpu-cli/tsdown.config.ts`), so they have to be released
 * whenever any other package is, to scaffold projects with the latest versions.
 */
const RELEASED_WITH_ANY_PACKAGE = ['@typegpu/cli'];

/**
 * The package whose version names the bump PR (`bump: typegpu 0.12.10 (+more)`).
 */
const MAIN_PACKAGE = 'typegpu';

/**
 * @typedef {Object} WorkspacePackage
 * @prop {string} name
 * @prop {string} dirname
 * @prop {string} packageJsonPath
 * @prop {string} source Contents of package.json
 * @prop {Record<string, any>} json
 *
 * @typedef {Object} Bump
 * @prop {WorkspacePackage} pkg
 * @prop {string} from
 * @prop {string} to
 * @prop {string} reason
 */

/**
 * @param {string} root
 * @returns {Promise<WorkspacePackage[]>}
 */
async function readWorkspacePackages(root) {
  const packagesDir = path.join(root, 'packages');
  const entries = await fs.readdir(packagesDir, { withFileTypes: true });

  const packages = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const packageJsonPath = path.join(packagesDir, entry.name, 'package.json');
        const source = await fs.readFile(packageJsonPath, 'utf-8').catch(() => undefined);
        if (source === undefined) {
          return undefined;
        }
        /** @type {WorkspacePackage} */
        const pkg = {
          name: JSON.parse(source).name,
          dirname: entry.name,
          packageJsonPath,
          source,
          json: JSON.parse(source),
        };
        return pkg;
      }),
  );

  return packages.filter((pkg) => pkg !== undefined);
}

/**
 * Whether `pkg` requires exactly the current version of `depName`
 * (`workspace:` or `workspace:*`, which pnpm publishes as an exact version).
 *
 * @param {WorkspacePackage} pkg
 * @param {string} depName
 */
function pinsExactly(pkg, depName) {
  return [pkg.json.dependencies, pkg.json.peerDependencies, pkg.json.optionalDependencies].some(
    (deps) => deps?.[depName] === 'workspace:' || deps?.[depName] === 'workspace:*',
  );
}

async function main() {
  const args = arg(
    {
      '--base': String,
      '--skip': [String],
      '--dry-run': Boolean,
    },
    { permissive: true },
  );

  const base = await resolveBase(args['--base']);
  const skip = args['--skip'] ?? [];
  const dryRun = args['--dry-run'] ?? false;

  const root = (await execa('git', ['rev-parse', '--show-toplevel'])).stdout;

  consola.start(`Planning version bumps for changes since '${base}'...`);
  consola.log('');

  const plan = await getReleasePlan({ base, head: 'HEAD', repoRoot: root });
  const packages = await readWorkspacePackages(root);
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));

  /** @type {Map<string, Bump>} */
  const bumps = new Map();

  for (const change of plan) {
    if (change.status !== 'needs-release' || skip.includes(change.name)) {
      continue;
    }
    const pkg = byName.get(change.name);
    if (!pkg) {
      continue;
    }
    if (!change.nextVersion) {
      consola.warn(`${change.name}@${change.version} is a prerelease, bump it by hand.`);
      continue;
    }
    bumps.set(change.name, {
      pkg,
      from: change.version,
      to: change.nextVersion,
      reason: `${change.sourceFiles.length} source file(s) changed`,
    });
  }

  /**
   * Adds a patch bump for `pkg`, unless it is private, skipped, a prerelease,
   * or was already bumped since `base`.
   *
   * @param {WorkspacePackage} pkg
   * @param {string} reason
   */
  async function addDependentBump(pkg, reason) {
    if (bumps.has(pkg.name) || pkg.json.private || skip.includes(pkg.name)) {
      return false;
    }
    const baseSource = await readFileAtRef(base, `packages/${pkg.dirname}/package.json`);
    const releasedVersion = baseSource ? JSON.parse(baseSource).version : undefined;
    if (releasedVersion !== pkg.json.version) {
      // Already bumped (or not released yet)
      return false;
    }
    const to = bumpPatch(pkg.json.version);
    if (!to) {
      consola.warn(`${pkg.name}@${pkg.json.version} is a prerelease, bump it by hand.`);
      return false;
    }
    bumps.set(pkg.name, { pkg, from: pkg.json.version, to, reason });
    return true;
  }

  // Packages that pin one of the bumped packages exactly have to be released along with it,
  // otherwise they'd conflict with the new version. Repeating until nothing changes, since
  // these bumps can cascade.
  let changed = true;
  while (changed) {
    changed = false;
    for (const pkg of packages) {
      for (const bumpedName of bumps.keys()) {
        if (pinsExactly(pkg, bumpedName)) {
          changed ||= await addDependentBump(pkg, `pins ${bumpedName} exactly`);
        }
      }
    }
  }

  if (bumps.size > 0) {
    for (const name of RELEASED_WITH_ANY_PACKAGE) {
      const pkg = byName.get(name);
      if (pkg) {
        await addDependentBump(pkg, 'bakes in the versions of other packages when built');
      }
    }
  }

  const alreadyBumped = plan.filter((change) => change.status === 'already-bumped');

  if (bumps.size === 0) {
    consola.success(
      alreadyBumped.length > 0
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

  // Everything released in this cycle, including packages bumped in earlier runs
  const released = [
    ...sortedBumps.map(({ pkg, to }) => ({ name: pkg.name, version: to })),
    ...alreadyBumped.map((change) => ({ name: change.name, version: change.version })),
  ].toSorted((a, b) => {
    // The main package first, then by name
    if (a.name === MAIN_PACKAGE) return -1;
    if (b.name === MAIN_PACKAGE) return 1;
    return a.name.localeCompare(b.name);
  });

  const [first] = released;
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
