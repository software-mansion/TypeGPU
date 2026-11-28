import { $ } from 'bun';
import { consola } from 'consola';
import colors from './colors.ts';

const packageNameRegex = /^packages\/([@\w-]+)\//;

async function main() {
  consola.start('Estimating change between release and main branches...');
  consola.log('');

  const diffMsg = await $`git diff --name-only release..main`.text();
  const filesChanged = diffMsg.split('\n').filter(Boolean).toSorted();

  consola.info(`${colors.Bold}Files changed:${colors.Reset}`);
  for (const file of filesChanged) {
    consola.log(`⋅ ${file}`);
  }
  consola.log('');

  const packagesChanged = new Set(
    filesChanged.map((file) => packageNameRegex.exec(file)?.[1]).filter(Boolean),
  );
  consola.info(`${colors.Bold}Packages changed:${colors.Reset}`);
  for (const pkg of packagesChanged) {
    consola.log(`⋅ ${pkg}`);
  }
  consola.log('');
}

export default main;
