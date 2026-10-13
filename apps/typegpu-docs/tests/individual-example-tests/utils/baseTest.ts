/**
 * @vitest-environment jsdom
 */

import { setupCommonMocks } from './commonMocks.ts';
import {
  extractShaderCodes,
  getExampleURLs,
  testExampleShaderGeneration,
  waitForExpectedCalls,
} from './testUtils.ts';

export interface ExampleTestConfig {
  category: string;
  name: string;
  controlTriggers?: string[];
  setupMocks?: () => void;
  waitTime?: number;
  expectedCalls?: number;
}

/**
 * Examples may defer parts of their cleanup, e.g. the React examples unmount with
 * `setTimeout(() => root.unmount(), 0)`, and React then flushes effects through `setImmediate`.
 * Waiting for two timer turns lets that work finish while the test environment still exists.
 */
async function settleDeferredCleanup() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export async function runExampleTest(
  config: ExampleTestConfig,
  device: GPUDevice,
): Promise<string> {
  if (config.setupMocks) {
    config.setupMocks();
  }

  const urls = getExampleURLs(config.category, config.name);
  const html = await import(urls.html);
  document.body.innerHTML = html.default;

  const example = await testExampleShaderGeneration(urls.ts, config.controlTriggers);

  const cleanup = async () => {
    if (typeof example?.onCleanup === 'function') {
      await example.onCleanup();
    }
  };

  let shaderCodes: string;
  try {
    if (config.expectedCalls) {
      await waitForExpectedCalls(device, config.expectedCalls);
    }

    // Extracted before the cleanup runs.
    shaderCodes = extractShaderCodes(device, config.expectedCalls);
  } catch (error) {
    // The original failure takes precedence, so a cleanup failure is only logged.
    await cleanup().catch((cleanupError: unknown) => {
      console.warn(`Example cleanup failed for '${config.name}':`, cleanupError);
    });
    await settleDeferredCleanup();
    throw error;
  }

  // Cleanup errors fail the test when nothing else did.
  await cleanup();
  await settleDeferredCleanup();
  return shaderCodes;
}

export { setupCommonMocks };
