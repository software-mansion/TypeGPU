import * as fs from 'node:fs/promises';
import {
  bundleWithTsdown,
  bundleWithWebpack,
  getFileSize,
  type ResultRecord,
} from './utils.ts';

const DIST_DIR = new URL('./dist/', import.meta.url);
const EXAMPLES_DIR = new URL('./tests/', import.meta.url);

/**
 * A list of test filenames in the tests directory.
 * E.g.: ['test1.ts', 'test2.ts', ...]
 */
const tests = await fs.readdir(EXAMPLES_DIR);

async function bundleTest(
  testFilename: string,
  bundler: string,
  bundle: (testUrl: URL, outUrl: URL) => Promise<URL>,
): Promise<ResultRecord> {
  const testUrl = new URL(testFilename, EXAMPLES_DIR);
  const outUrl = await bundle(testUrl, DIST_DIR);
  const size = await getFileSize(outUrl);

  return { testFilename, bundler, size };
}

async function main() {
  console.log('Starting bundler efficiency measurement...');
  await fs.mkdir(DIST_DIR, { recursive: true });

  const results = await Promise.allSettled(
    tests.flatMap((test) => [
      // https://github.com/software-mansion/TypeGPU/issues/2026
      // bundleTest(test, 'esbuild', bundleWithEsbuild),
      bundleTest(test, 'tsdown', bundleWithTsdown),
      bundleTest(test, 'webpack', bundleWithWebpack),
    ]),
  );

  if (results.some((result) => result.status === 'rejected')) {
    console.error('Some tests failed to bundle.');
    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(result.reason);
      }
    }
    process.exit(1);
  }

  const successfulResults = (
    results as PromiseFulfilledResult<ResultRecord>[]
  ).map((result) => result.value);

  // Save results as JSON
  await fs.writeFile(
    'results.json',
    JSON.stringify(successfulResults, null, 2),
  );

  console.log('\nMeasurement complete. Results saved to results.json');
}

await main();
