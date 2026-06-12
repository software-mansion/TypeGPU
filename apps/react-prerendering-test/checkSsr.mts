import { spawnSync } from 'node:child_process';

type Env = Record<string, string>;

function build(env: Env) {
  const { status, stderr } = spawnSync('pnpm', ['next', 'build'], {
    cwd: import.meta.dirname,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return { failed: status !== 0, output: stderr };
}

console.log('Building with SSR...');
const ssr = build({});
console.log(ssr.failed ? '\n' + ssr.output : 'OK');

console.log('========================================\n');

console.log('Building with SSR disabled...');
const noSsr = build({ NEXT_PUBLIC_DISABLE_SSR: '1' });
console.error(noSsr.failed ? noSsr.output : 'OK');
