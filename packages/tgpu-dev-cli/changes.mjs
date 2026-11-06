// @ts-check

import arg from 'arg';
import { consola } from 'consola';
import { getChangedFiles, getPackageDirnames, resolveBase } from './changed-files.mjs';
import colors from './colors.mjs';

async function main() {
  const args = arg(
    {
      '--base': String,
      '--head': String,
    },
    { permissive: true },
  );

  const base = await resolveBase(args['--base']);
  const head = args['--head'] ?? 'origin/main';

  consola.start(`Estimating changes made on '${head}' since it diverged from '${base}'...`);
  consola.log('');

  const filesChanged = await getChangedFiles({ base, head });

  consola.info(`${colors.Bold}Files changed:${colors.Reset}`);
  for (const file of filesChanged) {
    consola.log(`⋅ ${file}`);
  }
  consola.log('');

  consola.info(`${colors.Bold}Packages changed:${colors.Reset}`);
  for (const pkg of getPackageDirnames(filesChanged)) {
    consola.log(`⋅ ${pkg}`);
  }
  consola.log('');
}

export default main;
