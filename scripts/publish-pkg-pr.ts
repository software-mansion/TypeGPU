#!/usr/bin/env bun

import { $ } from 'bun';
import { getPackagesChangedSinceRelease, getPackages, getTag } from './_utils.ts';

async function main() {
  const packages = await getPackages();
  const changedNames = (await getPackagesChangedSinceRelease(packages)).map((pkg) => pkg.name);

  const toPublish = packages.filter((pkg) => {
    if (pkg.private) {
      console.log(`  skip  ${pkg.name} (package is private)`);
      return false;
    }

    if (!changedNames.includes(pkg.name)) {
      console.log(`  skip  ${pkg.name} (no changes since release)`);
      return false;
    }

    return true;
  });

  if (toPublish.length === 0) {
    console.log('\nNothing to publish.');
    return;
  }

  console.log(`\nPackages to publish on pkg.pr.new:\n`);

  const nameWidth = Math.max(...toPublish.map((p) => p.name.length));
  for (const { name, version } of toPublish) {
    console.log(`  ${name.padEnd(nameWidth)}  ${version.padEnd(20)}  tag: ${getTag(version)}`);
  }

  console.log();

  // Building the packages

  const buildArgs = toPublish.map((pkg) => `--filter=${pkg.name}`);
  await $`pnpm run ${buildArgs} prepublishOnly --skip-publish-tag-check`.env({
    ...process.env,
    SKIP_TESTS: 'true',
  });

  const publishArgs = toPublish.map((pkg) => `./packages/${pkg.dirname}`);

  await $`pnpm exec pkg-pr-new publish ${publishArgs} --json output.json --comment=off --pnpm --no-compact`.env(
    { ...process.env, SKIP_TESTS: 'true' },
  );
}

await main();
