#!/usr/bin/env bun

import { $ } from 'bun';
import { getPackages, getTag, isPublished, type PackageInfo } from './_utils.ts';

const isDryRun = process.env.DISABLE_DRY_RUN !== 'true';

async function main() {
  const packages = await getPackages();
  const toPublish: PackageInfo[] = [];

  await Promise.all(
    packages.map(async (pkg) => {
      if (pkg.private) {
        // Skip private packages
        return;
      }

      const { name, version } = pkg;

      if (await isPublished(name, version)) {
        console.log(`  skip  ${name}@${version} (already published)`);
        return;
      }

      toPublish.push(pkg);
    }),
  );

  if (toPublish.length === 0) {
    console.log('\nNothing to publish.');
    return;
  }

  console.log(`\nPackages to publish${isDryRun ? ' (dry run)' : ''}:\n`);

  const nameWidth = Math.max(...toPublish.map((p) => p.name.length));
  for (const { name, version } of toPublish) {
    console.log(`  ${name.padEnd(nameWidth)}  ${version.padEnd(20)}  tag: ${getTag(version)}`);
  }

  console.log();

  for (const { dir, name, version } of toPublish) {
    const tag = getTag(version);
    console.log(`Publishing ${name}@${version} [tag: ${tag}]...`);

    const args = [
      'publish',
      '--provenance',
      '--no-git-checks',
      ...(tag === 'latest' ? [] : ['--tag', tag]),
      ...(isDryRun ? ['--dry-run'] : []),
    ];

    await $`pnpm ${args}`.cwd(dir).env({ ...process.env, SKIP_TESTS: 'true' });

    console.log();
  }
}

await main();
