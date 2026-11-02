#!/usr/bin/env node
// @ts-check

import { spawn } from 'node:child_process';

function asyncSpawn(/** @type {Parameters<typeof spawn>} */ ...args) {
  return new Promise((resolve, reject) => {
    const child = spawn(...args);

    child.on('exit', (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      resolve(code ?? 0);
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
  return /** @param err {unknown} */ (err) => {
    console.error(`Failed to run '${label}':`, err);
    process.exit(1);
  };
}

(async () => {
  const windows = process.platform === 'win32';
  const npxCommand = windows ? 'npx.cmd' : 'npx';

  const code = await asyncSpawn(npxCommand, ['@typegpu/cli@latest', ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: windows, // needs to be ran through the shell on Windows
  }).catch(failedToRunErrHandler('npx @typegpu/cli@latest'));

  process.exit(code);
})();
