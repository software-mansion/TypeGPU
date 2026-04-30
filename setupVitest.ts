import * as fs from 'node:fs/promises';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEST_BUILT_CODE } from './env.ts';

if (TEST_BUILT_CODE === undefined) {
  throw new Error('TEST_BUILT_CODE must be "true" or "false"');
}

const PACKAGES_DIR = join(import.meta.dirname, 'packages');

interface PackageJson {
  name: string;
  main?: string | undefined;
  types?: string | undefined;
  exports?: Record<string, string> | undefined;
  publishConfig?: {
    main?: string | undefined;
    types?: string | undefined;
    exports?: Record<string, string> | undefined;
  };
}

export default async () => {
  if (!TEST_BUILT_CODE) {
    // Skip changing package.json to use built packages
    return;
  }

  const packageJsonPaths = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => join(PACKAGES_DIR, dirent.name, 'package.json'));

  const onExit: (() => void)[] = [];

  await Promise.all(
    packageJsonPaths.map(async (path) => {
      if (!existsSync(path)) return;

      const originalContent = await fs.readFile(path, 'utf-8');
      const packageJson: PackageJson = JSON.parse(originalContent);

      packageJson.main = packageJson.publishConfig?.main ?? packageJson.main;
      packageJson.types = packageJson.publishConfig?.types ?? packageJson.types;
      packageJson.exports = packageJson.publishConfig?.exports ?? packageJson.exports;

      await fs.writeFile(path, JSON.stringify(packageJson, null, 2), 'utf-8');

      onExit.push(() => {
        writeFileSync(path, originalContent, 'utf-8');
      });
    }),
  );

  process.on('SIGINT', () => {
    onExit.forEach((cb) => cb());
  });

  return () => {
    onExit.forEach((cb) => cb());
  };
};
