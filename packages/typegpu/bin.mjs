#!/usr/bin/env node
import { spawn } from 'node:child_process';
import pkg from './package.json' with { type: 'json' };

/**
 * Used to extract the version of `typegpu` that was used to
 * trigger the CLI, which then allows us to download the latest
 * version matching the major and minor of the `typegpu` package.
 */
const versionPattern = /^(\d+)\.(\d+)\.(\d+)/;

const result = versionPattern.exec(pkg.version);
const [_, major, minor] = result;

if (major === undefined || minor === undefined) {
  throw new Error(`TypeGPU version doesn't match the expected major.minor.patch format`);
}

/**
 * Targeting the latest version with the same major and minor as `typegpu`
 */
const semver = `^${major}.${minor}.0`;

/**
 * @returns {Promise<number | undefined>}
 */
function asyncSpawn(...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(...args);

    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        process.exit(0);
        return;
      }

      resolve(code);
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * @param {string} label
 */
function failedToRunErrHandler(label) {
  return (err) => {
    console.error(`Failed to run '${label}':`, err);
    process.exit(1);
  };
}

(async () => {
  const windows = process.platform === 'win32';
  const npxCommand = windows ? 'npx.cmd' : 'npx';

  const code = await asyncSpawn(npxCommand, [`@typegpu/cli@${semver}`, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: windows, // needs to be ran through the shell on Windows
  }).catch(failedToRunErrHandler(`npx @typegpu/cli@${semver}`));

  if (code !== 0) {
    console.warn(
      `Couldn't find @typegpu/cli version matching ${semver}, falling back to latest...`,
    );
    // Fallback to latest
    const code = await asyncSpawn(npxCommand, [`@typegpu/cli@latest`, ...process.argv.slice(2)], {
      stdio: 'inherit',
      shell: windows, // needs to be ran through the shell on Windows
    }).catch(failedToRunErrHandler('npx @typegpu/cli@latest'));
    process.exit(code ?? 0);
  }

  process.exit(code ?? 0);
})();
