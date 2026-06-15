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
    }));

  const dImports = Object.keys(d).map((importName) => ({
    import: 'd',
    item: importName,
  }));

  const stdImports = Object.keys(std).map((importName) => ({
    import: 'std',
    item: importName,
  }));

  const commonImports = Object.keys(common).map((importName) => ({
    import: 'common',
    item: importName,
  }));

  const imports: { import: string; item: string }[] = [
    ...tgpuImports,
    ...dImports,
    ...stdImports,
    ...commonImports,
  ];

  for (const { import: importName, item } of imports) {
    const testContent = `
import { ${importName} } from 'typegpu/$built$';
console.log(${importName}.${item});
    `;

    const fileName = `${importName}_${item}.ts`;
    await fs.writeFile(new URL(fileName, TESTS_DIR), testContent);
  }
}

await generateTestFiles();
