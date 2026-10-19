#!/usr/bin/env node
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import pkg from './package.json' with { type: 'json' };

const [major, minor] = pkg.version.split('.');
const semver = `^${major}.${minor}.0`;

const windows = process.platform === 'win32';
const npm = windows ? 'npm.cmd' : 'npm';
const npx = windows ? 'npx.cmd' : 'npx';
const execFileAsync = promisify(execFile);

/** True only when the registry confirms no `@typegpu/cli` satisfies `semver` */
async function noMatchingCli() {
  const args = ['view', `@typegpu/cli@${semver}`, 'version', '--json'];
  try {
    const { stdout } = await execFileAsync(npm, args, { shell: windows, timeout: 3_000 });
    return ['', '[]'].includes(stdout.trim());
  } catch (err) {
    return /E404|ETARGET/.test(err.stderr ?? '');
  }
}

/** Resolves with the child's exit code, re-raising a fatal signal on this process */
function run(command, args) {
  return new Promise((resolve, reject) => {
    spawn(command, args, { stdio: 'inherit', shell: windows })
      .on('error', reject)
      .on('exit', (code, signal) => {
        if (signal) {
          process.kill(process.pid, signal);
        } else {
          resolve(code ?? 1);
        }
      });
  });
}

const fallback = await noMatchingCli();
if (fallback) {
  console.warn(`Couldn't find @typegpu/cli version matching ${semver}, falling back to latest...`);
}
const spec = fallback ? '@typegpu/cli@latest' : `@typegpu/cli@${semver}`;

try {
  process.exit(await run(npx, [spec, ...process.argv.slice(2)]));
} catch (err) {
  console.error(`Failed to run 'npx ${spec}':`, err);
  process.exit(2);
}
