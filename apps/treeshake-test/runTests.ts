import { once } from 'node:events';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { Worker } from 'node:worker_threads';
import { availableBundlers, type BundlerName, type ResultRecord } from './bundleWith.ts';
import type { BundleTask } from './bundleWorker.ts';
import {
  DIST_NAMED_DIR,
  DIST_NAMESPACE_DIR,
  TESTS_NAMED_DIR,
  TESTS_NAMESPACE_DIR,
} from './urls.ts';

/**
 * Distributes bundling tasks across `concurrency` worker threads, each bundling
 * one test at a time. Starting every bundle at once in a single thread keeps
 * hundreds of module graphs alive simultaneously (which runs webpack out of memory)
 * while still being bottlenecked by a single JS thread.
 */
async function bundleInWorkers(
  tasks: BundleTask[],
  concurrency: number,
): Promise<PromiseSettledResult<ResultRecord>[]> {
  const results: PromiseSettledResult<ResultRecord>[] = Array.from({ length: tasks.length });
  let next = 0;

  const runWorker = async () => {
    const worker = new Worker(new URL('./bundleWorker.ts', import.meta.url));
    try {
      while (next < tasks.length) {
        const idx = next++;
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node's Worker
        worker.postMessage(tasks[idx]);
        // Rejects if the worker crashes (e.g. runs out of memory)
        [results[idx]] = await once(worker, 'message');
      }
    } finally {
      await worker.terminate();
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, runWorker));
  return results;
}

/**
 * Runs selected tests (named/namespace) bundlers that are included in options.
 */
async function main() {
  console.log('Starting bundler efficiency measurement...');
  const testVariant = process.argv[2];
  if (!(testVariant === 'named' || testVariant === 'namespace')) {
    console.error(`Test variant must either be 'named' or 'namespace' (was ${testVariant}).`);
    process.exit(1);
  }
  const sourceDir = testVariant === 'named' ? TESTS_NAMED_DIR : TESTS_NAMESPACE_DIR;
  const distDir = testVariant === 'named' ? DIST_NAMED_DIR : DIST_NAMESPACE_DIR;

  await fs.mkdir(distDir, { recursive: true });

  const bundlers: BundlerName[] = [];
  for (const option of process.argv.slice(3)) {
    const bundlerName = option.slice(2); // "--bundler"
    if (bundlerName in availableBundlers) {
      bundlers.push(bundlerName as BundlerName);
    } else {
      console.error(`Bundler '${bundlerName}' is unavailable.`);
      console.error(`Available bundlers: ${Object.keys(availableBundlers).join(', ')}`);
      process.exit(1);
    }
  }

  const concurrency = Number(process.env.TREESHAKE_CONCURRENCY) || os.availableParallelism();
  console.log(
    `Running ${testVariant} tests for bundlers: [${bundlers}] (concurrency: ${concurrency}).`,
  );

  const testNames = await fs.readdir(sourceDir);

  const results: PromiseSettledResult<ResultRecord>[] = [];
  // Bundlers run one after another, so that they don't compete for resources,
  // and per-bundler timings are meaningful.
  for (const bundler of bundlers) {
    const startTime = performance.now();
    const tasks = testNames.map(
      (testFilename): BundleTask => ({
        testFilename,
        bundler,
        testUrl: new URL(testFilename, sourceDir).href,
        distUrl: new URL(testFilename, distDir).href,
      }),
    );
    results.push(...(await bundleInWorkers(tasks, concurrency)));
    const seconds = ((performance.now() - startTime) / 1000).toFixed(1);
    console.log(`${bundler}: bundled ${testNames.length} tests in ${seconds}s`);
  }

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

  console.log(`\nMeasurement complete. Results saved to results_${testVariant}.json`);
}

await main();
