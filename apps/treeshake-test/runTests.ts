import * as fs from 'node:fs/promises';
import {
  bundleWithTsdown,
  bundleWithWebpack,
  getFileSize,
  type ResultRecord,
} from './bundleWith.ts';

type Bundler = (entryUrl: URL, outDir: URL) => Promise<URL>;

const DIST_DIR = new URL('./dist/', import.meta.url);
const TESTS_DIR = new URL('./tests/', import.meta.url);

async function bundleTest(
  testFilename: string,
  bundler: string,
  bundle: Bundler,
): Promise<ResultRecord> {
  const testUrl = new URL(testFilename, TESTS_DIR);
  const outUrl = await bundle(testUrl, DIST_DIR);
  const size = await getFileSize(outUrl);

  return { testFilename, bundler, size };
}

/**
 * Runs bundlers that are included in options.
 */
async function main() {
  console.log('Starting bundler efficiency measurement...');
  await fs.mkdir(DIST_DIR, { recursive: true });
  const availableBundlers: Record<string, Bundler> = {
    // https://github.com/software-mansion/TypeGPU/issues/2026
    // esbuild: bundleWithEsbuild,
    tsdown: bundleWithTsdown,
    webpack: bundleWithWebpack,
  };

  const bundlers: [string, Bundler][] = [];
  for (const option of process.argv.slice(2)) {
    const bundlerName = option.slice(2); // "--bundler"
    const bundler = availableBundlers[bundlerName];
    if (bundler) {
      bundlers.push([bundlerName, bundler]);
    } else {
      console.error(`Bundler '${bundlerName}' is unavailable.`);
      console.error(`Available bundlers: ${Object.keys(availableBundlers).join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`Running for bundlers: [${bundlers.map((e) => e[0])}].`);

  const tests = await fs.readdir(TESTS_DIR);

  const results = await Promise.allSettled(
    tests.flatMap((test) =>
      bundlers.map(([bundlerName, bundler]) => bundleTest(test, bundlerName, bundler)),
    ),
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

  const successfulResults = (results as PromiseFulfilledResult<ResultRecord>[]).map(
    (result) => result.value,
  );
  // Save results as JSON
  await fs.writeFile('results.json', JSON.stringify(successfulResults, null, 2));

  console.log('\nMeasurement complete. Results saved to results.json');
}

await main();
