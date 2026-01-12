import * as fs from 'node:fs/promises';
import * as tgpuAll from 'typegpu';
import * as dAll from 'typegpu/data';
import * as stdAll from 'typegpu/std';

const TESTS_DIR = new URL('./tests/', import.meta.url);

async function generateTestFiles() {
  await fs.mkdir(TESTS_DIR, { recursive: true });

  const imports: { export: string; from: string }[] = [];
  imports.push(
    ...(
      Object.keys(tgpuAll)
        .filter((key) => key !== 'default')
        .map((exportName) => ({ export: exportName, from: 'typegpu' }))
    ),
  );
  imports.push(
    ...(
      Object.keys(dAll)
        .filter((key) => key !== 'default')
        .map((exportName) => ({ export: exportName, from: 'typegpu/data' }))
    ),
  );
  imports.push(
    ...(
      Object.keys(stdAll)
        .filter((key) => key !== 'default')
        .map((exportName) => ({ export: exportName, from: 'typegpu/std' }))
    ),
  );

  for (const { export: exportName, from } of imports) {
    const testContent = `// Auto-generated test file for tree-shaking analysis
    import { ${exportName} } from '${from}';

    // Use the import to prevent it from being tree-shaken
    console.log(typeof ${exportName});
    `;

    const fileName = `import_${exportName}_from_${from.replaceAll('/', '')}.ts`;
    await fs.writeFile(new URL(fileName, TESTS_DIR), testContent);
  }

  //   // Generate tests for tgpu object properties
  //   const tgpuProps = Object.keys(tgpu);
  //   for (const prop of tgpuProps) {
  //     const testContent = `// Auto-generated test file for tree-shaking analysis
  // import tgpu from 'typegpu';

  // // Use the import to prevent it from being tree-shaken
  // console.log(typeof tgpu.${prop});
  // `;

  //     const fileName = `tgpu-${prop}.ts`;
  //     await fs.writeFile(new URL(fileName, TESTS_DIR), testContent);
  // }

  // console.log(
  //   `Generated ${1 + namedExports.length + tgpuProps.length} test files`,
  // );
  // console.log(`  - 1 default export test`);
  // console.log(`  - ${namedExports.length} named export tests`);
  // console.log(`  - ${tgpuProps.length} tgpu property tests`);
}

await generateTestFiles();
