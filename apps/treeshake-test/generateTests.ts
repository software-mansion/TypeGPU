import * as fs from 'node:fs/promises';
import { tgpu, d, std, common } from 'typegpu';
import { TESTS_NAMED_DIR, TESTS_NAMESPACE_DIR } from './urls.ts';

async function generateTestFiles() {
  await fs.mkdir(TESTS_NAMED_DIR, { recursive: true });
  await fs.mkdir(TESTS_NAMESPACE_DIR, { recursive: true });

  const tgpuImports = Object.keys(tgpu)
    .filter((key) => key !== '~unstable')
    .map((importName) => ({
      import: 'tgpu',
      item: importName,
      namespace: 'typegpu',
    }));

  const dImports = Object.keys(d).map((importName) => ({
    import: 'd',
    item: importName,
    namespace: 'typegpu/data',
  }));

  const stdImports = Object.keys(std).map((importName) => ({
    import: 'std',
    item: importName,
    namespace: 'typegpu/std',
  }));

  const commonImports = Object.keys(common).map((importName) => ({
    import: 'common',
    item: importName,
    namespace: 'typegpu/common',
  }));

  const imports: { import: string; item: string; namespace: string }[] = [
    ...tgpuImports,
    ...dImports,
    ...stdImports,
    ...commonImports,
  ];

  for (const { import: importName, item, namespace } of imports) {
    const fileName = `${importName}_${item}.ts`;

    const testNamedContent = `
import { ${importName} } from 'typegpu/$built$';
console.log(${importName}.${item});
    `;

    await fs.writeFile(new URL(fileName, TESTS_NAMED_DIR), testNamedContent);

    const testNamespaceContent = `
import${importName === 'tgpu' ? '' : ' * as'} ${importName} from '${namespace}/$built$';
console.log(${importName}.${item});
    `;

    await fs.writeFile(new URL(fileName, TESTS_NAMESPACE_DIR), testNamespaceContent);
  }
}

await generateTestFiles();
