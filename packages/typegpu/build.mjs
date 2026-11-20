import { $ } from 'bun';
import { consola } from 'consola';
import { cp, rm } from 'node:fs/promises';

const magenta = '\u001b[35m';
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
await rm('dist', { recursive: true, force: true, maxRetries: 3 });

consola.start('Building with tsc...');
await $`tsc --p tsconfig.build.json`;

consola.start('Inlining package version...');
const { version } = await Bun.file('package.json').json();
// Targets imports of the form: import { version } from 'typegpu/package.json';
const versionImport = /import\s*\{\s*version\s*\}\s*from\s*['"]typegpu\/package\.json['"];?\n?/g;
// Targets any JSON imports, used to verify if all JSON imports have been replaced.
const jsonImport = /from\s*['"]\S*\.json['"]/g;

for await (const path of new Bun.Glob('dist/**/*.js').scan('.')) {
  const file = Bun.file(path);
  const content = await file.text();
  const replaced = content.replace(versionImport, `const version = ${JSON.stringify(version)};\n`);

  if (jsonImport.test(replaced)) {
    throw new Error(`Not all JSON imports have been resolved: ${path}`);
  }

  if (replaced !== content) {
    consola.log(` - ${path}`);
    await Bun.write(path, replaced);
  }
}

consola.start('Copying bin.mjs...');
await Bun.write('dist/bin.mjs', Bun.file('bin.mjs'));

consola.start('Copying agent skills...');
await cp('skills', 'dist/skills', { recursive: true });

const skillPath = 'dist/skills/typegpu/SKILL.md';
const skill = await Bun.file(skillPath).text();
const stampedSkill = skill
  .replace('\n  library: typegpu\n', `\n  library: typegpu\n  library_version: '${version}'\n`)
  .replace(
    /^This skill targets TypeGPU .*$/m,
    `This copy of the skill ships with TypeGPU \`${version}\` and matches its API.`,
  );
if (!stampedSkill.includes('library_version') || !stampedSkill.includes('ships with TypeGPU')) {
  throw new Error(`Could not stamp the version into ${skillPath}`);
}
await Bun.write(skillPath, stampedSkill);

const agentsMd = `# typegpu ${version}

This is the installed copy of TypeGPU. Prefer it over anything you remember about TypeGPU.

- Start with ./skills/typegpu/SKILL.md. It routes to ./skills/typegpu/references/.
- The exact API is in ./index.d.ts and the .d.ts files next to it. Most public functions
  have TSDoc with @example blocks.
- Docs: https://docs.swmansion.com/TypeGPU/
`;
await Bun.write('dist/AGENTS.md', agentsMd);
await Bun.write('dist/CLAUDE.md', agentsMd);

consola.start('Swapping index declaration file...');
// Overriding the generated declaration file with a custom one, that
// better complies with older TypeScript versions
await rm('dist/index.d.ts');
await Bun.write('dist/index.d.ts', Bun.file('src/index.d.ts'));

consola.success('Success!');
