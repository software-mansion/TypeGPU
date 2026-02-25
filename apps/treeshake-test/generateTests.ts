import * as fs from 'node:fs/promises';
import * as tgpuAll from 'typegpu';
import * as dAll from 'typegpu/data';
import * as stdAll from 'typegpu/std';

const TESTS_DIR = new URL('./tests/', import.meta.url);

async function generateTestFiles() {
  await fs.mkdir(TESTS_DIR, { recursive: true });

  const tgpuAllImports = Object.keys(tgpuAll)
    .filter((key) => key !== 'default')
    .map((exportName) => ({
      export: exportName,
      from: 'typegpu',
      log: exportName,
    }));

  const dAllImports = Object.keys(dAll).map((exportName) => ({
    export: exportName,
    from: 'typegpu/data',
    log: exportName,
  }));

  const stdAllImports = Object.keys(stdAll).map((exportName) => ({
    export: exportName,
    from: 'typegpu/std',
    log: exportName,
  }));

  const tgpuImports = Object.keys(tgpuAll.tgpu)
    .filter((key) => key !== '~unstable')
    .map((exportName) => ({
      export: 'tgpu',
      from: 'typegpu',
      log: `tgpu.${exportName}`,
    }));

  const imports: { export: string; from: string; log: string }[] = [
    ...tgpuAllImports,
    ...dAllImports,
    ...stdAllImports,
    ...tgpuImports,
  ];

  for (const { export: exportName, from, log } of imports) {
    const testContent = `
import { ${exportName} } from '${from}';
console.log(typeof ${log});
    `;

    const fileName = `${log}_from_${from.replaceAll('/', '')}.ts`;
    await fs.writeFile(new URL(fileName, TESTS_DIR), testContent);
  }
}

await generateTestFiles();
