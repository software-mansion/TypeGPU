// @ts-check

import { consola } from 'consola';
import { execa } from 'execa';
import { filter, map, pipe, unique } from 'remeda';
import colors from './colors.mjs';

const packageNameRegex = /^packages\/([@\w-]+)\//g;

async function main() {
  const $ = execa({ all: true });

  consola.start('Estimating change between release and main branches...');
  consola.log('');

  const diffMsg = (await $`git diff --name-only release..main`.pipe('sort')).stdout;
  const filesChanged = diffMsg.split('\n');

  consola.info(`${colors.Bold}Files changed:${colors.Reset}`);
  for (const file of filesChanged) {
    consola.log(`⋅ ${file}`);
  }
  consola.log('');

  const packagesChanged = pipe(
    filesChanged,
    map((file) => packageNameRegex.exec(file)?.[1]),
    filter(Boolean),
    unique(),
  );
  // consola.log(diffMsg.split('\n'));
  consola.info(`${colors.Bold}Packages changed:${colors.Reset}`);
  for (const pkg of packagesChanged) {
    consola.log(`⋅ ${pkg}`);
  }
  consola.log('');
}

export default main;
