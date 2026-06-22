/**
 * @vitest-environment jsdom
 */

import tgpu from 'typegpu';
import { setupCommonMocks } from './commonMocks.ts';
import {
  extractShaderCodes,
  getExampleURLs,
  testExampleShaderGeneration,
  waitForExpectedCalls,
} from './testUtils.ts';

let resizePatched = false;

function allowTextureResize(device: GPUDevice) {
  if (resizePatched) {
    return;
  }
  resizePatched = true;

  const root = tgpu.initFromDevice({ device });
  const proto = Object.getPrototypeOf(
    root.createTexture({ size: [1, 1], format: 'rgba8unorm' }),
  ) as { write: (source: unknown, options?: object) => unknown };
  const originalWrite = proto.write;
  proto.write = function (this: unknown, source: unknown, options?: object) {
    return originalWrite.call(this, source, { ...options, resize: true });
  };
}

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

  allowTextureResize(device);

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
