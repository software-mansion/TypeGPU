// @ts-check

import arg from 'arg';
import { consola } from 'consola';
import { resolveBase } from './changed-files.mjs';
import colors from './colors.mjs';
import { getReleasePlan } from './release-plan.mjs';

/**
 * @param {string[]} rows
 */
function logRows(rows) {
  for (const row of rows) {
    consola.log(`  ${row}`);
  }
  consola.log('');
}

async function main() {
  const args = arg(
    {
      '--base': String,
      '--head': String,
      '--verbose': Boolean,
      '-v': '--verbose',
    },
    { permissive: true },
  );

  const base = await resolveBase(args['--base']);
  const head = args['--head'] ?? 'origin/main';
  const verbose = args['--verbose'] ?? false;

  consola.start(`Estimating changes made on '${head}' since it diverged from '${base}'...`);
  consola.log('');

  const plan = await getReleasePlan({ base, head });
  const nameWidth = Math.max(0, ...plan.map((pkg) => pkg.name.length));

  /**
   * @param {import('./release-plan.mjs').PackageChange} pkg
   * @param {string} details
   */
  const row = (pkg, details) => `${pkg.name.padEnd(nameWidth)}  ${details}`;

  /**
   * @param {import('./release-plan.mjs').PackageChange} pkg
   */
  const fileCount = (pkg) => {
    const count = pkg.sourceFiles.length;
    return `${colors.BrightBlack}(${count} source file${count === 1 ? '' : 's'})${colors.Reset}`;
  };

  if (verbose) {
    for (const pkg of plan) {
      consola.info(`${colors.Bold}${pkg.name}${colors.Reset} (${pkg.status})`);
      for (const file of pkg.sourceFiles) {
        consola.log(`  ⋅ ${file}`);
      }
      for (const file of pkg.nonSourceFiles) {
        consola.log(`  ${colors.BrightBlack}⋅ ${file} (not shipped)${colors.Reset}`);
      }
      consola.log('');
    }
  }

  const toRelease = plan.filter((pkg) => pkg.status === 'needs-release');
  const newPackages = plan.filter((pkg) => pkg.status === 'new');
  const alreadyBumped = plan.filter((pkg) => pkg.status === 'already-bumped');
  const skipped = plan.filter(
    (pkg) => pkg.status === 'non-source-only' || pkg.status === 'private',
  );

  if (toRelease.length > 0) {
    consola.info(`${colors.Bold}Packages to release:${colors.Reset}`);
    logRows(
      toRelease.map((pkg) =>
        row(
          pkg,
          `${pkg.version} → ${colors.Green}${pkg.nextVersion ?? '(prerelease, bump by hand)'}${colors.Reset}  ${fileCount(pkg)}`,
        ),
      ),
    );
  }

  if (newPackages.length > 0) {
    consola.info(`${colors.Bold}New packages (not on '${base}' yet):${colors.Reset}`);
    logRows(newPackages.map((pkg) => row(pkg, `${pkg.version}  ${fileCount(pkg)}`)));
  }

  if (alreadyBumped.length > 0) {
    consola.info(`${colors.Bold}Already bumped:${colors.Reset}`);
    logRows(alreadyBumped.map((pkg) => row(pkg, `${pkg.releasedVersion} → ${pkg.version}`)));
  }

  if (skipped.length > 0) {
    consola.info(`${colors.Bold}Changed, but no release needed:${colors.Reset}`);
    logRows(
      skipped.map((pkg) =>
        row(
          pkg,
          `${colors.BrightBlack}${pkg.status === 'private' ? 'private' : 'tests, docs or configs only'}${colors.Reset}`,
        ),
      ),
    );
  }

  if (plan.length === 0) {
    consola.success('No packages changed.');
  } else if (!verbose) {
    consola.log(
      `${colors.BrightBlack}Run with --verbose to list the changed files.${colors.Reset}`,
    );
  }
}

export default main;
