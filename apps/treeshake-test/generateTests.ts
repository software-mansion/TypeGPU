import * as fs from 'node:fs/promises';
import { tgpu, d, std, common } from 'typegpu';

const TESTS_DIR = new URL('./tests/', import.meta.url);

async function generateTestFiles() {
  await fs.mkdir(TESTS_DIR, { recursive: true });

  const tgpuImports = Object.keys(tgpu)
    .filter((key) => key !== '~unstable')
    .map((importName) => ({
      import: 'tgpu',
      item: importName,
      endpoint: 'typegpu',
    }));

  const dImports = Object.keys(d).map((importName) => ({
    import: 'd',
    item: importName,
    endpoint: 'typegpu/data',
  }));

  const stdImports = Object.keys(std).map((importName) => ({
    import: 'std',
    item: importName,
    endpoint: 'typegpu/std',
  }));

  const commonImports = Object.keys(common).map((importName) => ({
    import: 'common',
    item: importName,
    endpoint: 'typegpu/common',
  }));

  const imports: { import: string; item: string; endpoint: string }[] = [
    ...tgpuImports,
    ...dImports,
    ...stdImports,
    ...commonImports,
  ];

  for (const { import: importName, item, endpoint } of imports) {
    const fileName = `${importName}_${item}.ts`;

    const testDirectContent = `
import { ${importName} } from 'typegpu/$built$';
console.log(${importName}.${item});
    `;

    await fs.writeFile(new URL(fileName, `${TESTS_DIR}direct/`), testDirectContent);

    const testEndpointContent = `
import * as ${importName} from '${endpoint}/$built$';
console.log(${importName}.${item});
    `;

    await fs.writeFile(new URL(fileName, `${TESTS_DIR}endpoint/`), testEndpointContent);
  }
}

await generateTestFiles();
