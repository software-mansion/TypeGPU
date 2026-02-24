// @ts-check
/*
 * Used as a pre-publishing step.
 */

import arg from 'arg';
import { consola } from 'consola';
import { execa } from 'execa';
import * as fs from 'node:fs/promises';
import process from 'node:process';
import { entries, mapValues } from 'remeda';
import color from './colors.mjs';
import { FAIL, IN_PROGRESS, SUCCESS } from './icons.mjs';
import { Frog } from './log.mjs';
import { progress } from './progress.mjs';
import { verifyPublishTag } from './verify-publish-tag.mjs';

const cwd = new URL(`file:${process.cwd()}/`);

/**
 * @param {*} value
 * @param {(path: string, value: string) => string} transform
 * @param {string=} path
 * @returns {*}
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
  let distPackageJson = structuredClone(packageJson);

  // Replacing `exports`, `main`, and `types` with `publishConfig.*`
  if (distPackageJson.publishConfig?.main) {
    distPackageJson.main = distPackageJson.publishConfig.main;
  }
  if (distPackageJson.publishConfig?.types) {
    distPackageJson.types = distPackageJson.publishConfig.types;
  }
  if (distPackageJson.publishConfig?.exports) {
    distPackageJson.exports = distPackageJson.publishConfig.exports;
  }
  distPackageJson.publishConfig = undefined;

  // Altering paths in the package.json
  distPackageJson = deepMapStrings(distPackageJson, (_path, value) => {
    if (value.startsWith('./dist/')) {
      return value.replace(/^\.\/dist/, '.');
    }
    if (value.startsWith('./src/')) {
      return value.replace(/^\.\/src/, '.');
    }
    return value;
  });

  // Erroring out on any wildcard dependencies
  for (
    const [moduleKey, versionSpec] of entries(
      distPackageJson.dependencies ?? {},
    )
  ) {
    if (versionSpec === '*' || versionSpec === 'workspace:*') {
      throw new Error(
        `Cannot depend on a module with a wildcard version. (${moduleKey}: ${versionSpec})`,
      );
    }
  }

  distPackageJson.private = false;
  distPackageJson.scripts = {};
  // Removing dev dependencies.
  distPackageJson.devDependencies = undefined;
  // Removing workspace specifiers in dependencies.
  distPackageJson.dependencies = mapValues(
    distPackageJson.dependencies ?? {},
    (/** @type {string} */ value) => value.replace(/^workspace:/, ''),
  );
  distPackageJson.peerDependencies = mapValues(
    distPackageJson.peerDependencies ?? {},
    (/** @type {string} */ value) => value.replace(/^workspace:/, ''),
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

/**
 * @typedef {'in_progress' | 'success' | 'fail'} TaskStatus
 */

/** @type {Record<TaskStatus, string>} */
const ICON = {
  in_progress: IN_PROGRESS,
  success: SUCCESS,
  fail: FAIL,
};

async function main() {
  consola.start('Preparing the package for publishing');
  console.log('');

  const args = arg({
    '--skip-publish-tag-check': Boolean,
    '--skip-all-checks': Boolean,
  });

  if (!args['--skip-publish-tag-check'] && !args['--skip-all-checks']) {
    verifyPublishTag();
  }

  /** @type {PromiseSettledResult<*>[]} */
  const results = await progress('', async (update) => {
    /** @typedef {'style' | 'build' | 'unit' | 'types' | 'circular-deps' } TaskName */

    /** @type {Record<TaskName, TaskStatus>} */
    const status = {
      build: 'in_progress',
      style: 'in_progress',
      unit: 'in_progress',
      types: 'in_progress',
      'circular-deps': 'in_progress',
    };

    const taskString = (/** @type {TaskName} */ name) =>
      `${
        {
          in_progress: color.Magenta,
          success: color.Green,
          fail: color.Red,
        }[status[name]]
      }${ICON[status[name]]}${color.Reset} ${name}`;

    const updateMsg = () =>
      update(
        `${color.BgBrightMagenta}${color.Black}${Frog}📋 working on tasks...${color.Reset}  ${
          taskString('build')
        }, ${taskString('style')}, ${taskString('unit')}, ${
          taskString('types')
        }, ${taskString('circular-deps')}`,
      );

    /**
     * @template {Promise<*>} T
     * @param {TaskName} name
     * @param {T} promise
     * @returns {T}
     */
    const withStatusUpdate = (name, promise) => /** @type {T} */ (
      promise
        .then((result) => {
          status[name] = 'success';
          updateMsg();
          return result;
        })
        .catch((err) => {
          status[name] = 'fail';
          updateMsg();
          err.taskName = name;
          throw err;
        })
    );

    const $ = execa({ all: true });

    const results = [
      // First build
      ...await Promise.allSettled([
        withStatusUpdate('build', $`pnpm build`),
      ]),
      // Then the rest
      ...(args['--skip-all-checks'] ? [] : await Promise.allSettled([
        withStatusUpdate('style', $`pnpm -w test:style`),
        withStatusUpdate('unit', $`pnpm -w test:unit`),
        withStatusUpdate('types', $`pnpm -w test:types`),
        withStatusUpdate('circular-deps', $`pnpm -w test:circular-deps`),
      ])),
    ];

    update(
      `${color.BgBrightMagenta}${color.Black}${Frog}${
        Object.values(status).includes('fail') ? '👎' : '👍'
      } finished!${color.Reset}  ${taskString('build')}, ${
        taskString('style')
      }, ${taskString('unit')}, ${taskString('types')}, ${
        taskString('circular-deps')
      }`,
    );

    return results;
  });

  console.log('');

  const rejected = /** @type {PromiseRejectedResult[]} */ (
    results.filter((result) => result.status === 'rejected')
  );

  for (const rej of rejected) {
    consola.error(`Task '${rej.reason.taskName}' failed\n`, rej.reason.stderr);
  }
  if (rejected.length > 0) {
    process.exit(1);
  }

  consola.start('Transforming miscellaneous files...');

  await Promise.all([transformPackageJSON(), transformReadme()]);

  consola.success('Package prepared!');
}

export default main;
