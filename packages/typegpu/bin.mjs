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

function asyncSpawn(...args) {
  return new Promise((resolve, _reject) => {
    const child = spawn(...args);

    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        process.exit(0);
        return;
      }

      resolve(code);
    });
  });
}

(async () => {
  const code = await asyncSpawn('npx', [`@typegpu/cli@${semver}`, ...process.argv.slice(2)], {
    stdio: ['inherit', 'inherit', 'ignore'],
  });

  if (code !== 0) {
    console.warn(
      `Couldn't find @typegpu/cli version matching ${semver}, falling back to latest...`,
    );
    // Fallback to latest
    const code = await asyncSpawn('npx', [`@typegpu/cli@latest`, ...process.argv.slice(2)], {
      stdio: 'inherit',
    });
    process.exit(code ?? 0);
  }

  process.exit(code ?? 0);
})();
