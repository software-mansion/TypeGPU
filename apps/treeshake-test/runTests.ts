import * as fs from 'node:fs/promises';
import {
  bundleWithTsdown,
  bundleWithWebpack,
  getFileSize,
  type ResultRecord,
} from './bundleWith.ts';
import {
  DIST_NAMED_DIR,
  DIST_NAMESPACE_DIR,
  TESTS_NAMED_DIR,
  TESTS_NAMESPACE_DIR,
} from './urls.ts';

type Bundler = (entryUrl: URL, outDir: URL) => Promise<URL>;

async function bundleTest(
  testName: string,
  testUrl: URL,
  distUrl: URL,
  bundler: string,
  bundle: Bundler,
): Promise<ResultRecord> {
  const outUrl = await bundle(testUrl, distUrl);
  return { testFilename: testName, bundler, size: await getFileSize(outUrl) };
}

/**
 * Runs selected tests (named/namespace) bundlers that are included in options.
 */
async function main() {
  console.log('Starting bundler efficiency measurement...');
  const testVariant = process.argv[2] === 'named' ? 'named' : 'namespace';
  const sourceDir = testVariant === 'named' ? TESTS_NAMED_DIR : TESTS_NAMESPACE_DIR;
  const distDir = testVariant === 'named' ? DIST_NAMED_DIR : DIST_NAMESPACE_DIR;

  await fs.mkdir(distDir, { recursive: true });
  const availableBundlers: Record<string, Bundler> = {
    // https://github.com/software-mansion/TypeGPU/issues/2026
    // esbuild: bundleWithEsbuild,
    tsdown: bundleWithTsdown,
    webpack: bundleWithWebpack,
  };

  const bundlers: [string, Bundler][] = [];
  for (const option of process.argv.slice(3)) {
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

  console.log(`Running ${testVariant} tests for bundlers: [${bundlers.map((e) => e[0])}].`);

  const testNames = await fs.readdir(sourceDir);

  const results = await Promise.allSettled(
    testNames.flatMap((test) =>
      bundlers.map(([bundlerName, bundler]) =>
        bundleTest(test, new URL(test, sourceDir), new URL(test, distDir), bundlerName, bundler),
      ),
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
  await fs.writeFile(`results_${testVariant}.json`, JSON.stringify(successfulResults, null, 2));

  console.log('\nMeasurement complete. Results saved to results.json');
}

await main();
