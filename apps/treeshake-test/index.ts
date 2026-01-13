import * as fs from 'node:fs/promises';
import {
  bundleWithTsdown,
  bundleWithWebpack,
  getFileSize,
  type ResultRecord,
} from './utils.ts';

const DIST_DIR = new URL('./dist/', import.meta.url);
const TESTS_DIR = new URL('./tests/', import.meta.url);

/**
 * A list of test filenames in the tests directory.
 * E.g.: ['test1.ts', 'test2.ts', ...]
 */
const tests = await fs.readdir(TESTS_DIR);

async function bundleTest(
  testFilename: string,
  bundler: string,
  bundle: (testUrl: URL, outUrl: URL) => Promise<URL>,
): Promise<ResultRecord> {
  const testUrl = new URL(testFilename, TESTS_DIR);
  const outUrl = await bundle(testUrl, DIST_DIR);
  const size = await getFileSize(outUrl);

  return { testFilename, bundler, size };
}

async function main() {
  console.log('Starting bundler efficiency measurement...');
  await fs.mkdir(DIST_DIR, { recursive: true });

  const bundlers = [
    // https://github.com/software-mansion/TypeGPU/issues/2026
    // { name: 'esbuild', fn: bundleWithEsbuild },
    { name: 'tsdown', fn: bundleWithTsdown },
    { name: 'webpack', fn: bundleWithWebpack },
  ];

  const successfulResults: ResultRecord[] = [];
  let hasErrors = false;

  for (const test of tests) {
    for (const bundler of bundlers) {
      try {
        const result = await bundleTest(test, bundler.name, bundler.fn);
        successfulResults.push(result);
      } catch (error) {
        console.error(`Failed to bundle ${test} with ${bundler.name}:`, error);
        hasErrors = true;
      }
    }
  }

  if (hasErrors) {
    console.error('\nSome tests failed to bundle.');
    process.exit(1);
  }

  // Save results as JSON
  await fs.writeFile(
    'results.json',
    JSON.stringify(successfulResults, null, 2),
  );

  console.log('\nMeasurement complete. Results saved to results.json');
}

await main();
