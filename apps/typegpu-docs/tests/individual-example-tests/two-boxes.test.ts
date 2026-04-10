/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockResizeObserver } from './utils/commonMocks.ts';

describe('two boxes example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'two-boxes',
        setupMocks: mockResizeObserver,
        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Camera {
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera: Camera;

      struct Transform {
        model: mat4x4f,
      }

      @group(0) @binding(1) var<uniform> transform: Transform;

      struct vertex_Output {
        @builtin(position) pos: vec4f,
        @location(0) color: vec4f,
      }

      @vertex fn vertex(@location(0) _arg_position: vec4f, @location(1) _arg_color: vec4f) -> vertex_Output {
        var pos = (camera.projection * (camera.view * (transform.model * _arg_position)));
        return vertex_Output(pos, _arg_color);
      }

      struct fragment_Input {
        @location(0) color: vec4f,
      }

      @fragment fn fragment(_arg_0: fragment_Input) -> @location(0) vec4f {
        return _arg_0.color;
      }"
    `);
  });
});
