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

      @group(0) @binding(0) var<uniform> pointLightPosition: vec2f;

      @group(0) @binding(1) var<uniform> resolutionUniform: vec2f;

      @group(0) @binding(2) var<uniform> pointLightScale: f32;

      fn getBrightness(uv: vec2f) -> f32 {
        var offset = (uv - pointLightPosition);
        offset.x *= (resolutionUniform.x / resolutionUniform.y);
        return (pointLightScale / length(offset));
      }

      fn srgbToLinear(rgb: vec3f) -> vec3f {
        return select((rgb / 12.92f), pow(((rgb + vec3f(0.054999999701976776)) / 1.055f), vec3f(2.4000000953674316)), (rgb > vec3f(0.040449999272823334)));
      }

      @group(0) @binding(3) var<uniform> pointLightColor: vec3f;

      @group(0) @binding(4) var<uniform> exposureUniform: f32;

      fn aces(rgb: vec3f) -> vec3f {
        let exposedColor = (rgb * exposureUniform);
        const a = 2.51;
        const b = 0.03;
        const c = 2.43;
        const dd = 0.59;
        const e = 0.14;
        return saturate(((exposedColor * ((a * exposedColor) + b)) / ((exposedColor * ((c * exposedColor) + dd)) + e)));
      }

      fn hableCurve(x: vec3f) -> vec3f {
        const a = 0.15;
        const b = 0.5;
        const c = 0.1;
        const dd = 0.2;
        const e = 0.02;
        const f = 0.3;
        return ((((x * ((a * x) + (c * b))) + (dd * e)) / ((x * ((a * x) + b)) + (dd * f))) - (e / f));
      }

      fn hable(rgb: vec3f) -> vec3f {
        let W = vec3f(11.199999809265137);
        let exposedColor = (rgb * exposureUniform);
        return saturate((hableCurve(exposedColor) / hableCurve(W)));
      }

      fn reinhard(rgb: vec3f) -> vec3f {
        let exposedColor = (rgb * exposureUniform);
        return saturate((exposedColor / (1f + exposedColor)));
      }

      fn neutral(rgb: vec3f) -> vec3f {
        let exposedColor = (rgb * exposureUniform);
        const startCompression = 0.76;
        const desaturation = 0.15;
        let x = min(min(exposedColor.r, exposedColor.g), exposedColor.b);
        let offset = select(0.04f, (x - ((6.25f * x) * x)), (x < 0.08f));
        var color = (exposedColor - offset);
        let peak = max(max(color.r, color.g), color.b);
        if ((peak < startCompression)) {
          return saturate(color);
        }
        let dd = (1f - startCompression);
        let newPeak = (1f - ((dd * dd) / ((peak - startCompression) + dd)));
        color *= (newPeak / peak);
        let g = (1f - (1f / ((desaturation * (peak - newPeak)) + 1f)));
        return saturate(mix(color, vec3f(newPeak), g));
      }

      @group(0) @binding(5) var<uniform> tonemappingUniform: u32;

      struct mainFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment(_arg_0: mainFragment_Input) -> @location(0) vec4f {
        let brightness = getBrightness(_arg_0.uv);
        var color = (srgbToLinear(pointLightColor) * brightness);
        switch tonemappingUniform {
          case 1u: {
            color = aces(color);
          }
          case 2u: {
            color = hable(color);
          }
          case 3u: {
            color = reinhard(color);
          }
          case 4u: {
            color = neutral(color);
          }
          case default: {

          }
        }
        return vec4f(color, 1f);
      }"
    `);
  });
});
