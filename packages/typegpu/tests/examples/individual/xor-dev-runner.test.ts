/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('xor dev runner example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'xor-dev-runner',
        expectedCalls: 1,
        setupMocks: () => {
          mockResizeObserver();
        },
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct vertexMain_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct vertexMain_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn vertexMain(input: vertexMain_Input) -> vertexMain_Output {
        var pos = array<vec2f, 3>(vec2f(-1), vec2f(3, -1), vec2f(-1, 3));
        return vertexMain_Output(vec4f(pos[input.vertexIndex], 0f, 1f), pos[input.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> colorUniform: vec3f;

      struct Camera {
        pos: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
        viewInverse: mat4x4f,
        projectionInverse: mat4x4f,
      }

      @group(0) @binding(1) var<uniform> cameraUniform: Camera;

      struct Ray {
        origin: vec4f,
        direction: vec4f,
      }

      fn getRayForUV(uv: vec2f) -> Ray {
        let camera = (&cameraUniform);
        var farView = ((*camera).projectionInverse * vec4f(uv, 1f, 1f));
        var farWorld = ((*camera).viewInverse * vec4f((farView.xyz / farView.w), 1f));
        var direction = normalize((farWorld.xyz - (*camera).pos.xyz));
        return Ray((*camera).pos, vec4f(direction, 0f));
      }

      @group(0) @binding(2) var<uniform> controlsOffsetUniform: f32;

      @group(0) @binding(3) var<uniform> autoMoveOffsetUniform: vec3f;

      fn mod_1(v: vec3f, a: f32) -> vec3f{
        return fract(v / a) * a;
      }

      fn rotateXZ(angle: f32) -> mat3x3f {
        return mat3x3f(vec3f(cos(angle), 0f, sin(angle)), vec3f(0, 1, 0), vec3f(-(sin(angle)), 0f, cos(angle)));
      }

      @group(0) @binding(4) var<uniform> shiftUniform: f32;

      fn safeTanh(v: f32) -> f32 {
        return select(tanh(v), sign(v), (abs(v) > 10f));
      }

      struct fragmentMain_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain(_arg_0: fragmentMain_Input) -> @location(0) vec4f {
        var icolor = (colorUniform * 4f);
        var ray = getRayForUV(_arg_0.uv);
        var acc = vec3f();
        var z = 0f;
        for (var l = 0; (l < 30i); l++) {
          var p = ((((vec3f(3, 0, 3) + controlsOffsetUniform) + autoMoveOffsetUniform) + ray.origin.xyz) + (ray.direction.xyz * z));
          var q = p;
          var prox = p.y;
          for (var i = 40.1; (i > 0.01f); i *= 0.2f) {
            q = ((i * 0.9f) - abs((mod_1(q, (i + i)) - i)));
            let minQ = min(min(q.x, q.y), q.z);
            prox = max(prox, minQ);
            q = (q * rotateXZ(shiftUniform));
          }
          z += prox;
          acc = (acc + ((icolor - safeTanh((p.y + 4f))) * ((0.1f * prox) / (1f + z))));
        }
        acc = tanh((acc * acc));
        return vec4f(acc, 1f);
      }"
    `);
  });
});
