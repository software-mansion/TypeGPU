/*
 * Used as a pre-publishing step.
 */

import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import process from 'node:process';
import { omitBy } from 'remeda';

const cwd = new URL(`file:${process.cwd()}/`);

/**
 * @param {string} command The command to run
 * @returns {Promise<string>} The standard out of the process
 */
function promiseExec(command) {
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

/**
 *
 * @param {*} value
 * @param {(path: string, value: string) => string} transform
 * @param {string=} path
 * @returns
 */
function deepMapStrings(value, transform, path = '') {
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
  const packageJsonUrl = new URL('./package.json', cwd);
  const distPackageJsonUrl = new URL('./dist/package.json', cwd);

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
    (/** @type {string} */ value) => value.startsWith('workspace:'),
  );

  await fs.writeFile(
    distPackageJsonUrl,
    JSON.stringify(distPackageJson, undefined, 2),
    'utf-8',
  );

  // Copying over README.md
  const readmeUrl = new URL('./README.md', cwd);
  const distReadmeUrl = new URL('./dist/README.md', cwd);
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
