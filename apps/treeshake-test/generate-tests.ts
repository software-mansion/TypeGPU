import * as fs from 'node:fs/promises';
import tgpu from 'typegpu';
import * as tgpuAll from 'typegpu';

const TESTS_DIR = new URL('./tests/', import.meta.url);

async function generateTestFiles() {
  //   await fs.mkdir(TESTS_DIR, { recursive: true });

  //   // Clear existing test files
  //   const existingFiles = await fs.readdir(TESTS_DIR);
  //   for (const file of existingFiles) {
  //     if (file.endsWith('.ts')) {
  //       await fs.unlink(new URL(file, TESTS_DIR));
  //     }
  //   }

  //   // Generate test for default export
  //   const defaultTestContent =
  //     `// Auto-generated test file for tree-shaking analysis
  // import tgpu from 'typegpu';

  // // Use the import to prevent it from being tree-shaken
  // console.log(typeof tgpu);
  // `;
  //   await fs.writeFile(new URL('default.ts', TESTS_DIR), defaultTestContent);

  // Generate test files for each named export
  const namedExports = Object.keys(tgpuAll).filter((key) => key !== 'default');

  console.log('NAMED EXPORTS');
  console.log(namedExports);
  //   for (const exportName of namedExports) {
  //     const testContent = `// Auto-generated test file for tree-shaking analysis
  // import { ${exportName} } from 'typegpu';

  // // Use the import to prevent it from being tree-shaken
  // console.log(typeof ${exportName});
  // `;

  //     const fileName = `${exportName}.ts`;
  //     await fs.writeFile(new URL(fileName, TESTS_DIR), testContent);
  //   }

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
