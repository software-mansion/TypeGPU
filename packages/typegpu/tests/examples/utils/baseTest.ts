/**
 * @vitest-environment jsdom
 */

import { setupCommonMocks } from './commonMocks.ts';
import {
  extractShaderCodes,
  getExampleURLs,
  testExampleShaderGeneration,
} from './testUtils.ts';

export interface ExampleTestConfig {
  category: string;
  name: string;
  controlTriggers?: string[];
  setupMocks?: () => void;
  waitTime?: number;
  expectedCalls?: number;
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

  await testExampleShaderGeneration(urls.ts, config.controlTriggers);

  if (config.expectedCalls) {
    await waitForExpectedCalls(device, config.expectedCalls);
  }

  return extractShaderCodes(device, config.expectedCalls);
}

async function waitForExpectedCalls(
  // biome-ignore lint/suspicious/noExplicitAny: it's a mock
  device: any,
  expectedCalls: number,
): Promise<void> {
  const maxWaitTime = 1000;
  const pollInterval = 10;
  let elapsed = 0;

  while (elapsed < maxWaitTime) {
    const currentCalls = device.mock?.createShaderModule?.mock?.calls?.length ||
      0;
    if (currentCalls >= expectedCalls) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    elapsed += pollInterval;
  }

  console.warn(
    `Timeout waiting for ${expectedCalls} shader calls, got ${
      device.mock?.createShaderModule?.mock?.calls?.length || 0
    }`,
  );
}

export { setupCommonMocks };
