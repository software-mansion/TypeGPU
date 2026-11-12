import { parentPort } from 'node:worker_threads';
import {
  availableBundlers,
  getFileSize,
  type BundlerName,
  type ResultRecord,
} from './bundleWith.ts';

export type BundleTask = {
  testFilename: string;
  bundler: BundlerName;
  testUrl: string;
  distUrl: string;
};

/**
 * Bundles tests one at a time, as instructed by `runTests.ts`.
 * Each worker thread has its own JS event loop, so CPU-heavy bundlers
 * (webpack + Terser) can bundle multiple tests in parallel.
 */
const port = parentPort;
if (!port) {
  throw new Error('bundleWorker.ts is meant to be run as a worker thread (see runTests.ts)');
}

port.on('message', async (task: BundleTask) => {
  let result: PromiseSettledResult<ResultRecord>;
  try {
    const bundle = availableBundlers[task.bundler];
    const outUrl = await bundle(new URL(task.testUrl), new URL(task.distUrl));
    result = {
      status: 'fulfilled',
      value: {
        testFilename: task.testFilename,
        bundler: task.bundler,
        size: await getFileSize(outUrl),
      },
    };
  } catch (reason) {
    result = { status: 'rejected', reason };
  }
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Node's MessagePort
  port.postMessage(result);
});
