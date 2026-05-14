/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { setupCommonMocks } from './utils/baseTest.ts';
import { extractShaderCodes, testExampleShaderGeneration } from './utils/testUtils.ts';

const docsRoot = process.cwd().endsWith('apps/typegpu-docs')
  ? process.cwd()
  : join(process.cwd(), 'apps/typegpu-docs');
const bundlePath = join(docsRoot, 'public/assets/selfie-segmentation/selfie_segmenter.ssgbin');

describe('selfie segmentation example', () => {
  setupCommonMocks();

  it('should load the packed-f16 SSG1 v2 bundle', () => {
    const bundle = readFileSync(bundlePath);

    expect(bundle.toString('ascii', 0, 4)).toBe('SSG1');
    expect(bundle.readUInt32LE(4)).toBe(2);
    expect(bundle.readUInt32LE(40)).toBe(8);
  });

  it('should produce valid specialized segmentation shaders', async ({ device }) => {
    setupSelfieSegmentationMocks();
    document.body.innerHTML = readFileSync(
      join(docsRoot, 'src/examples/image-processing/selfie-segmentation/index.html'),
      'utf8',
    );

    const example = await testExampleShaderGeneration(
      '../../../src/examples/image-processing/selfie-segmentation/index',
    );
    const shaderCodes = extractShaderCodes(device);

    expect(example.controls['post processing'].initial).toBe(true);
    expect(shaderCodes).toContain('texture_external');
    expect(shaderCodes).toContain('@compute @workgroup_size(64)');
    expect(shaderCodes).toContain('textureSampleBaseClampToEdge');
    expect(shaderCodes).toContain('texture_2d<f32>');
    expect(shaderCodes).toContain('texture_storage_2d<rgba8unorm, write>');
    expect(shaderCodes).toContain('textureStore');
    expect(shaderCodes).toContain('smoothstep(0.28f, 0.72f');
    expect(shaderCodes).toContain('(i & 255u)');
    expect(shaderCodes).toContain('(i >> 8u)');
    expect(shaderCodes).toContain('unpack2x16float');
    expect(shaderCodes).toContain('array<u32>');
    expect(shaderCodes).toContain('array<f32>');
    expect(shaderCodes).toContain('abs');
    expect(shaderCodes).toContain('smoothstep(0.55f, 0.92f');
    expect(shaderCodes).toContain('smoothstep(0.07f, 0.2f');
    expect(shaderCodes).toContain('smoothstep(0.86f, 1f');
    expect(shaderCodes).toContain('0.08f');
    expect(shaderCodes).toContain('0.45f');
    expect(shaderCodes).toContain('0.75f');
    expect(shaderCodes).toContain('smoothstep(0.28f, 0.62f');
    expect(shaderCodes).toContain('0.7f');
    expect(shaderCodes).toContain('clamp');
    expect(shaderCodes).toContain('0.0625f');
    expect(shaderCodes).toContain('var<storage, read> weights: array<u32>');
  });
});

function setupSelfieSegmentationMocks() {
  const bundle = readFileSync(bundlePath);
  const bundleBuffer = bundle.buffer.slice(
    bundle.byteOffset,
    bundle.byteOffset + bundle.byteLength,
  );

  vi.stubGlobal('fetch', async (url: string) => {
    if (url === '/TypeGPU/assets/selfie-segmentation/selfie_segmenter.ssgbin') {
      return new Response(bundleBuffer);
    }
    return new Response();
  });

  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [],
      })),
    },
    configurable: true,
  });

  const srcObjects = new WeakMap<HTMLMediaElement, MediaStream | null>();
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
    get() {
      return srcObjects.get(this) ?? null;
    },
    set(value) {
      srcObjects.set(this, value as MediaStream | null);
    },
    configurable: true,
  });
}
