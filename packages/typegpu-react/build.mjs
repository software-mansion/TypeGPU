import { $ } from 'bun';
import { consola } from 'consola';
import { rm } from 'node:fs/promises';

process.chdir(import.meta.dir);

consola.start('Cleaning dist...');
await rm('dist', { recursive: true, force: true, maxRetries: 3 });

consola.start('Building with tsc...');
await $`tsc --p tsconfig.build.json`;

consola.start('Inlining package version...');
const { version } = await Bun.file('package.json').json();
// Targets imports of the form: import { version } from '../../package.json' with { type: 'json' };
const versionImport =
  /import\s*\{\s*version\s*\}\s*from\s*['"]\S*package\.json['"](\s*with\s*\{[^}]*\})?;?\n?/g;
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

consola.success('Success!');
