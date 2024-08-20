/*
 * Used as a pre-publishing step.
 */

import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import { omitBy } from 'remeda';

function promiseExec(command: string) {
  return new Promise((resolve, reject) => {
    const childProcess = exec(command, {}, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout);
    });

    childProcess.stdout?.pipe(process.stdout);
    childProcess.stderr?.pipe(process.stderr);
  });
}

function deepMapStrings(
  value: unknown,
  transform: (path: string, value: string) => string,
  path = '',
) {
  if (value === undefined || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [
        key,
        deepMapStrings(val, transform, `${path}.${key}`),
      ]),
    );
  }

  if (typeof value === 'string') {
    return transform(path, value);
  }

  return value;
}

async function main() {
  const packageJsonUrl = new URL('../package.json', import.meta.url);
  const distPackageJsonUrl = new URL('../dist/package.json', import.meta.url);

  const packageJson = JSON.parse(await fs.readFile(packageJsonUrl, 'utf-8'));

  await promiseExec(
    'pnpm build && pnpm -w test:spec && pnpm test:types && biome check .',
  );

  // Altering paths in the package.json
  const distPackageJson = deepMapStrings(packageJson, (_path, value) => {
    if (value.startsWith('./dist/')) {
      return value.replace(/^\.\/dist/, '.');
    }

    return value;
  });
  distPackageJson.private = false;
  distPackageJson.scripts = {};
  // Removing any links to other workspace packages.
  distPackageJson.devDependencies = omitBy(
    distPackageJson.devDependencies,
    (value: string) => value.startsWith('workspace:'),
  );

  await fs.writeFile(
    distPackageJsonUrl,
    JSON.stringify(distPackageJson, undefined, 2),
    'utf-8',
  );

  // Copying over README.md
  const readmeUrl = new URL('../README.md', import.meta.url);
  const distReadmeUrl = new URL('../dist/README.md', import.meta.url);
  await fs.copyFile(readmeUrl, distReadmeUrl);

  console.log(
    `

-------------------------------------------------------------------------

(  ◦°^°◦) Package prepared! Now run the following to publish the package:

cd dist && pnpm publish
`,
  );
}

await main();
