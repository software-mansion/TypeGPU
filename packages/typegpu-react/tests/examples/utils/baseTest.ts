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
  name: string;
  setupMocks?: () => void;
  expectedCalls?: number;
}

export async function runExampleTest(
  config: ExampleTestConfig,
  device: GPUDevice,
): Promise<string> {
  if (config.setupMocks) {
    config.setupMocks();
  }

  const urls = getExampleURLs(config.name);
  const html = await import(urls.html);
  document.body.innerHTML = html.default;

  await testExampleShaderGeneration(urls.tsx);

  if (config.expectedCalls) {
    await waitForExpectedCalls(device, config.expectedCalls);
  }

  return extractShaderCodes(device, config.expectedCalls);
}

export { setupCommonMocks };
