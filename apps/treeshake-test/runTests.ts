import * as fs from 'node:fs/promises';
import {
  bundleWithTsdown,
  bundleWithWebpack,
  getFileSize,
  type ResultRecord,
} from './bundleWith.ts';
import {
  DIST_DIRECT_DIR,
  DIST_ENDPOINT_DIR,
  TESTS_DIRECT_DIR,
  TESTS_ENDPOINT_DIR,
} from './urls.ts';

type Bundler = (entryUrl: URL, outDir: URL) => Promise<URL>;

async function exists(url: URL): Promise<boolean> {
  try {
    await fs.access(url);
    return true;
  } catch {
    return false;
  }
}

async function bundleTest(
  testFilename: string,
  bundler: string,
  bundle: Bundler,
): Promise<ResultRecord> {
  // each test may have two variants: direct imports and dedicated endpoints
  const size: ResultRecord['size'] = {};
  const testDirectUrl = new URL(testFilename, TESTS_DIRECT_DIR);
  if (await exists(testDirectUrl)) {
    const outDirectUrl = await bundle(testDirectUrl, DIST_DIRECT_DIR);
    size.direct = await getFileSize(outDirectUrl);
  }
  const testEndpointUrl = new URL(testFilename, TESTS_ENDPOINT_DIR);
  if (await exists(testEndpointUrl)) {
    const outEndpointUrl = await bundle(testEndpointUrl, DIST_ENDPOINT_DIR);
    size.endpoint = await getFileSize(outEndpointUrl);
  }

  return { testFilename, bundler, size };
}

/**
 * Runs bundlers that are included in options.
 */
async function main() {
  console.log('Starting bundler efficiency measurement...');
  await fs.mkdir(DIST_DIRECT_DIR, { recursive: true });
  await fs.mkdir(DIST_ENDPOINT_DIR, { recursive: true });
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

  const testNames = [
    ...new Set([
      ...(await fs.readdir(TESTS_DIRECT_DIR)),
      ...(await fs.readdir(TESTS_ENDPOINT_DIR)),
    ]),
  ];

  const results = await Promise.allSettled(
    testNames.flatMap((test) =>
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
