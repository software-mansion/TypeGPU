/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockResizeObserver } from './utils/commonMocks.ts';

describe('mesh patches example', () => {
  setupCommonMocks();

  it('resolves one instanced pipeline per patch surface', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'mesh-patches',
        setupMocks: mockResizeObserver,
        expectedCalls: 3,
      },
      device,
    );

    const signatures = shaderCodes.match(/^fn .*(?= \{$)/gm);
    expect([...new Set(signatures)].join('\n')).toMatchInlineSnapshot(`
      "fn triangleBarycentrics(vertex_1: u32, segments: u32) -> vec3f
      fn warp(cosAngle: f32, t: f32) -> f32
      fn uniformArea(a: vec3f, b: vec3f, c: vec3f, weights: vec3f) -> vec3f
      fn at(patch_1: u32, w: vec3f) -> Surface
      fn bitSigns(bits: u32) -> vec3f
      fn cornerNormal(octant: u32, weights: vec3f) -> vec3f
      fn quadCoordinates(triangle: u32, weights: vec3f) -> vec2f
      fn arc(a: vec3f, b: vec3f, t: f32) -> vec3f
      fn edgeSurface(triangle: u32, weights: vec3f, center: vec3f, axis: vec3f, u: vec3f, v: vec3f, halfHeight: f32, radius: f32) -> Surface
      fn at(index: u32, w: vec3f) -> Surface"
    `);
  });
});
