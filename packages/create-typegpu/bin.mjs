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

(async () => {
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  try {
    const code = await asyncSpawn(npxCommand, ['@typegpu/cli@latest', ...process.argv.slice(2)], {
      stdio: 'inherit',
    });
    process.exit(code);
  } catch (err) {
    console.error('Failed to run @typegpu/cli via npx:', err);
    process.exit(1);
  }
})();
