// @ts-check
/*
 * Used as a pre-publishing step.
 */

import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import process from 'node:process';
import { entries, mapValues, omitBy } from 'remeda';
import { Frog } from './log.mjs';

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

async function transformPackageJSON() {
  const packageJsonUrl = new URL('./package.json', cwd);
  const distPackageJsonUrl = new URL('./dist/package.json', cwd);

  const packageJson = JSON.parse(await fs.readFile(packageJsonUrl, 'utf-8'));

  // Altering paths in the package.json
  const distPackageJson = deepMapStrings(packageJson, (_path, value) => {
    if (value.startsWith('./dist/')) {
      return value.replace(/^\.\/dist/, '.');
    }
    return value;
  });

  // Erroring out on any wildcard dependencies
  for (const [moduleKey, versionSpec] of [
    ...entries(distPackageJson.dependencies),
    ...entries(distPackageJson.devDependencies),
  ]) {
    if (versionSpec === '*' || versionSpec === 'workspace:*') {
      throw new Error(
        `Cannot depend on a module with a wildcard version. (${moduleKey}: ${versionSpec})`,
      );
    }
  }

  distPackageJson.private = false;
  distPackageJson.scripts = {};
  // Removing any links to other workspace packages in dev dependencies.
  distPackageJson.devDependencies = omitBy(
    distPackageJson.devDependencies,
    (/** @type {string} */ value) => value.startsWith('workspace:*'),
  );
  // Removing workspace specifiers in dependencies.
  distPackageJson.dependencies = mapValues(
    distPackageJson.dependencies,
    (/** @type {string} */ value) => value.replace(/^workspace:*/, ''),
  );

  await fs.writeFile(
    distPackageJsonUrl,
    JSON.stringify(distPackageJson, undefined, 2),
    'utf-8',
  );
}

async function transformReadme() {
  const readmeUrl = new URL('./README.md', cwd);
  const distReadmeUrl = new URL('./dist/README.md', cwd);

  let readme = await fs.readFile(readmeUrl, 'utf-8');

  // npmjs.com does not handle multiple logos well, remove the dark mode only one.
  readme = readme.replace(/!.*#gh-dark-mode-only\)/, '');

  await fs.writeFile(distReadmeUrl, readme, 'utf-8');
}

async function main() {
  await promiseExec(
    'pnpm build && pnpm -w test:spec && pnpm test:types && biome check .',
  );

  await Promise.all([transformPackageJSON(), transformReadme()]);

  console.log(
    `

-------------------------------------------------------------------------

${Frog} Package prepared! Now run the following to publish the package:

cd dist && pnpm publish
`,
  );
}

export default main;
