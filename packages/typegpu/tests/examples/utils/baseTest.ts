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

export { setupCommonMocks };
