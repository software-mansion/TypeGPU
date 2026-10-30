import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('B46: changes lists every changed package in consecutive diff entries', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tgpu-changes-regression-'));
  try {
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: directory, stdio: 'pipe', timeout: 10_000 });
    git('init', '-b', 'main');
    git('config', 'user.email', 'regression@example.invalid');
    git('config', 'user.name', 'Regression Test');
    git('config', 'commit.gpgSign', 'false');
    git('config', 'core.hooksPath', path.join(directory, 'no-hooks'));
    for (const name of ['alpha', 'beta', 'gamma']) {
      fs.mkdirSync(path.join(directory, 'packages', name), { recursive: true });
      fs.writeFileSync(
        path.join(directory, 'packages', name, 'index.ts'),
        'export const value = 1;\n',
      );
    }
    git('add', '.');
    git('commit', '-m', 'initial');
    git('branch', 'release');
    for (const name of ['alpha', 'beta', 'gamma']) {
      fs.appendFileSync(path.join(directory, 'packages', name, 'index.ts'), '// changed\n');
    }
    git('add', '.');
    git('commit', '-m', 'changes');
    const moduleUrl = new URL('../changes.mjs', import.meta.url).href;
    const script = `const {default: changes} = await import(${JSON.stringify(moduleUrl)}); await changes();`;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: directory,
      encoding: 'utf8',
      // Vitest's NODE_ENV=test otherwise silences consola in the child process.
      env: { ...process.env, NO_COLOR: '1', CONSOLA_LEVEL: '4' },
      timeout: 10_000,
    });
    expect(output).toContain('Packages changed:');
    const packages = output.split('Packages changed:')[1];
    for (const name of ['alpha', 'beta', 'gamma']) {
      expect.soft(packages).toContain(name);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
