import { $ } from 'bun';
import { consola } from 'consola';

const magenta = '\u001b[35m';
const green = `\u001b[32;1m`;
const reset = '\u001b[0m';

console.log(`
${magenta}  /|
${magenta}  \\|____
${magenta}  , \`\\  \\    ${reset}┏━━━━━━━━━━━━━━━━━━━━━┓
${magenta} / \`\\ \\  \\  ${reset} ┃ Building TypeGPU... ┃
${magenta} \\   \`\\| /   ${reset}┗━━━━━━━━━━━━━━━━━━━━━┛
${magenta}  \\_____/
`);

process.chdir(import.meta.dir);

consola.start('Cleaning dist...');
await $`rm -rf dist`;

consola.start('Building with tsc...');
await $`tsc --p tsconfig.build.json`;

consola.start('Swapping index declaration file...');
// Overriding the generated declaration file with a custom one, that
// better complies with older TypeScript versions
await $`rm dist/index.d.ts`;
await Bun.write('dist/index.d.ts', Bun.file('src/index.d.ts'));

consola.success('Success!');
