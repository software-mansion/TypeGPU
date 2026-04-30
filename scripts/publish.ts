#!/usr/bin/env bun

import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { $ } from 'bun';

const PACKAGES_DIR = join(import.meta.dir, '../packages');
const isDryRun = process.env.DISABLE_DRY_RUN !== 'true';

function getTag(version: string): string {
  if (version.includes('-alpha.')) return 'alpha';
  if (version.includes('-beta.')) return 'beta';
  if (version.includes('-rc.')) return 'rc';
  if (version.includes('-nightly.')) return 'nightly';
  if (!version.includes('-')) return 'latest';
  throw new Error(`Invalid version: ${version}`);
}

async function isPublished(name: string, version: string): Promise<boolean> {
  const encodedName = encodeURIComponent(name);
  const response = await fetch(
    `https://registry.npmjs.org/${encodedName}/${encodeURIComponent(version)}`,
  );
  return response.ok;
}

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
}

async function main() {
  const dirs = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(PACKAGES_DIR, d.name));

  const toPublish: Array<{
    dir: string;
    name: string;
    version: string;
    tag: string;
  }> = [];

  await Promise.all(
    dirs.map(async (dir) => {
      const pkgJsonPath = join(dir, 'package.json');
      if (!existsSync(pkgJsonPath)) {
        return;
      }

      const pkg: PackageJson = await Bun.file(pkgJsonPath).json();
      if (pkg.private) {
        // Skip private packages
        return;
      }

      const { name, version } = pkg;

      if (await isPublished(name, version)) {
        console.log(`  skip  ${name}@${version} (already published)`);
        return;
      }

      toPublish.push({ dir, name, version, tag: getTag(version) });
    }),
  );

  if (toPublish.length === 0) {
    console.log('\nNothing to publish.');
    return;
  }

  console.log(`\nPackages to publish${isDryRun ? ' (dry run)' : ''}:\n`);

  const nameWidth = Math.max(...toPublish.map((p) => p.name.length));
  for (const { name, version, tag } of toPublish) {
    console.log(`  ${name.padEnd(nameWidth)}  ${version.padEnd(20)}  tag: ${tag}`);
  }

  console.log();

  for (const { dir, name, version, tag } of toPublish) {
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
