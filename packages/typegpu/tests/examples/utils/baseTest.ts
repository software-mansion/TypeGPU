/**
 * @vitest-environment jsdom
 */

import { setupCommonMocks } from './commonMocks.ts';
import {
  extractShaderCodes,
  getExampleURLs,
  testExampleShaderGeneration,
  waitForAsyncOperations,
} from './testUtils.ts';

export interface ExampleTestConfig {
  category: string;
  name: string;
  controlTriggers?: string[];
  setupMocks?: () => void;
  waitForAsync?: boolean;
  waitTime?: number;
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

  if (config.waitForAsync) {
    await waitForAsyncOperations(config.waitTime);
  }

  return extractShaderCodes(device);
}

export { setupCommonMocks };
