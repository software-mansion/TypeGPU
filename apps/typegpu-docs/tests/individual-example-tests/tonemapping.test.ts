/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('tonemapping example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'image-processing',
        name: 'tonemapping',
        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(@builtin(vertex_index) vertexIndex: u32) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[vertexIndex], 0, 1), uv[vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> pointLightX: f32;

      @group(0) @binding(1) var<uniform> pointLightY: f32;

      @group(0) @binding(2) var<uniform> pointLightScale: f32;

      @group(0) @binding(3) var<uniform> pointLightColor: vec3f;

      @group(0) @binding(4) var<uniform> tonemappingUniform: u32;

      fn aces(rgb: vec3f) -> vec3f {
        const a = 2.51;
        const b = 0.03;
        const c = 2.43;
        const d = 0.59;
        const e = 0.14;
        return saturate(((rgb * ((a * rgb) + b)) / ((rgb * ((c * rgb) + d)) + e)));
      }

      fn hableCurve(x: vec3f) -> vec3f {
        const a = 0.15;
        const b = 0.5;
        const c = 0.1;
        const d = 0.2;
        const e = 0.02;
        const f = 0.3;
        return ((((x * ((a * x) + (c * b))) + (d * e)) / ((x * ((a * x) + b)) + (d * f))) - (e / f));
      }

      fn hable(rgb: vec3f) -> vec3f {
        let W = vec3f(11.199999809265137);
        return saturate((hableCurve(rgb) / hableCurve(W)));
      }

      fn reinhard(rgb: vec3f) -> vec3f {
        return saturate((rgb / (vec3f(1) + rgb)));
      }

      fn neutral(rgb: vec3f) -> vec3f {
        const startCompression = 0.76;
        const desaturation = 0.15;
        let x = min(rgb.r, min(rgb.g, rgb.b));
        let offset = select(0.04f, (x - ((6.25f * x) * x)), (x < 0.08f));
        var color = (rgb - offset);
        let peak = max(color.r, max(color.g, color.b));
        if ((peak < startCompression)) {
          return saturate(color);
        }
        let d = (1f - startCompression);
        let newPeak = (1f - ((d * d) / ((peak - startCompression) + d)));
        color *= (newPeak / peak);
        let g = (1f - (1f / ((desaturation * (peak - newPeak)) + 1f)));
        return saturate(mix(color, vec3f(newPeak), g));
      }

      struct mainFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment(_arg_0: mainFragment_Input) -> @location(0) vec4f {
        let brightness = (pointLightScale / length((_arg_0.uv - vec2f(pointLightX, pointLightY))));
        var color = (pointLightColor * brightness);
        if ((tonemappingUniform == 1u)) {
          color = aces(color);
        }
        else {
          if ((tonemappingUniform == 2u)) {
            color = hable(color);
          }
          else {
            if ((tonemappingUniform == 3u)) {
              color = reinhard(color);
            }
            else {
              if ((tonemappingUniform == 4u)) {
                color = neutral(color);
              }
            }
          }
        }
        return vec4f(color, 1f);
      }"
    `);
  });
});
