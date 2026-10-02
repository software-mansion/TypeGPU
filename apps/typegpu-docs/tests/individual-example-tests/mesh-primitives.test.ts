/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockResizeObserver } from './utils/commonMocks.ts';

describe('mesh primitives example', () => {
  setupCommonMocks();

  it('resolves the procedural scene and its shadows', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'mesh-primitives',
        setupMocks: mockResizeObserver,
        expectedCalls: 3,
      },
      device,
    );

    const uniforms = shaderCodes.match(
      /struct (?:Camera|Light|SceneUniforms) \{[^}]*\}|@group[^\n]*var<uniform>[^\n]*/g,
    );
    expect([...new Set(uniforms)].join('\n\n')).toMatchInlineSnapshot(`
      "struct Camera {
        position: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
        viewInverse: mat4x4f,
        projectionInverse: mat4x4f,
      }

      struct Light {
        viewProj: mat4x4f,
        direction: vec3f,
      }

      struct SceneUniforms {
        camera: Camera,
        light: Light,
        time: f32,
      }

      @group(0) @binding(0) var<uniform> uniforms: SceneUniforms;"
    `);
  });
});
