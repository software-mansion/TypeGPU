/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('jump flood (distance) example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'algorithms',
      name: 'jump-flood-distance',
      expectedCalls: 4,
      setupMocks: mockResizeObserver,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(1) @binding(1) var writeView: texture_storage_2d<rgba16float, write>;

      @group(1) @binding(0) var maskTexture: texture_storage_2d<r32uint, read>;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        var size = textureDimensions(writeView);
        var pos = vec2f(f32(x), f32(y));
        var uv = (pos / vec2f(size));
        let mask = textureLoad(maskTexture, vec2i(i32(x), i32(y))).x;
        let inside = (mask > 0u);
        var invalid = vec2f(-1);
        var insideCoord = select(invalid, uv, inside);
        var outsideCoord = select(uv, invalid, inside);
        textureStore(writeView, vec2i(i32(x), i32(y)), vec4f(insideCoord, outsideCoord));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<uniform> offsetUniform: i32;

      @group(1) @binding(1) var readView: texture_storage_2d<rgba16float, read>;

      struct SampleResult {
        inside: vec2f,
        outside: vec2f,
      }

      fn sampleWithOffset(tex: texture_storage_2d<rgba16float, read>, pos: vec2i, offset: vec2i) -> SampleResult {
        var dims = textureDimensions(tex);
        var samplePos = (pos + offset);
        let outOfBounds = ((((samplePos.x < 0i) || (samplePos.y < 0i)) || (samplePos.x >= i32(dims.x))) || (samplePos.y >= i32(dims.y)));
        var safePos = clamp(samplePos, vec2i(), vec2i((dims - 1u)));
        var loaded = textureLoad(tex, safePos);
        var inside = loaded.xy;
        var outside = loaded.zw;
        return SampleResult(select(inside, vec2f(-1), outOfBounds), select(outside, vec2f(-1), outOfBounds));
      }

      @group(1) @binding(0) var writeView: texture_storage_2d<rgba16float, write>;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        let offset = offsetUniform;
        var size = textureDimensions(readView);
        var pos = vec2f(f32(x), f32(y));
        var bestInsideCoord = vec2f(-1);
        var bestOutsideCoord = vec2f(-1);
        var bestInsideDist = 1e+20;
        var bestOutsideDist = 1e+20;
        // unrolled iteration #0
        {
          // unrolled iteration #0
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((-1i * offset), (-1i * offset)));
            if ((sample.inside.x >= 0f)) {
              let dInside = distance(pos, (sample.inside * vec2f(size)));
              if ((dInside < bestInsideDist)) {
                bestInsideDist = dInside;
                bestInsideCoord = sample.inside;
              }
            }
            if ((sample.outside.x >= 0f)) {
              let dOutside = distance(pos, (sample.outside * vec2f(size)));
              if ((dOutside < bestOutsideDist)) {
                bestOutsideDist = dOutside;
                bestOutsideCoord = sample.outside;
              }
            }
          }
          // unrolled iteration #1
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((-1i * offset), (0i * offset)));
            if ((sample.inside.x >= 0f)) {
              let dInside = distance(pos, (sample.inside * vec2f(size)));
              if ((dInside < bestInsideDist)) {
                bestInsideDist = dInside;
                bestInsideCoord = sample.inside;
              }
            }
            if ((sample.outside.x >= 0f)) {
              let dOutside = distance(pos, (sample.outside * vec2f(size)));
              if ((dOutside < bestOutsideDist)) {
                bestOutsideDist = dOutside;
                bestOutsideCoord = sample.outside;
              }
            }
          }
          // unrolled iteration #2
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((-1i * offset), (1i * offset)));
            if ((sample.inside.x >= 0f)) {
              let dInside = distance(pos, (sample.inside * vec2f(size)));
              if ((dInside < bestInsideDist)) {
                bestInsideDist = dInside;
                bestInsideCoord = sample.inside;
              }
            }
            if ((sample.outside.x >= 0f)) {
              let dOutside = distance(pos, (sample.outside * vec2f(size)));
              if ((dOutside < bestOutsideDist)) {
                bestOutsideDist = dOutside;
                bestOutsideCoord = sample.outside;
              }
            }
          }
        }
        // unrolled iteration #1
        {
          // unrolled iteration #0
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((0i * offset), (-1i * offset)));
            if ((sample.inside.x >= 0f)) {
              let dInside = distance(pos, (sample.inside * vec2f(size)));
              if ((dInside < bestInsideDist)) {
                bestInsideDist = dInside;
                bestInsideCoord = sample.inside;
              }
            }
            if ((sample.outside.x >= 0f)) {
              let dOutside = distance(pos, (sample.outside * vec2f(size)));
              if ((dOutside < bestOutsideDist)) {
                bestOutsideDist = dOutside;
                bestOutsideCoord = sample.outside;
              }
            }
          }
          // unrolled iteration #1
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((0i * offset), (0i * offset)));
            if ((sample.inside.x >= 0f)) {
              let dInside = distance(pos, (sample.inside * vec2f(size)));
              if ((dInside < bestInsideDist)) {
                bestInsideDist = dInside;
                bestInsideCoord = sample.inside;
              }
            }
            if ((sample.outside.x >= 0f)) {
              let dOutside = distance(pos, (sample.outside * vec2f(size)));
              if ((dOutside < bestOutsideDist)) {
                bestOutsideDist = dOutside;
                bestOutsideCoord = sample.outside;
              }
            }
          }
          // unrolled iteration #2
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((0i * offset), (1i * offset)));
            if ((sample.inside.x >= 0f)) {
              let dInside = distance(pos, (sample.inside * vec2f(size)));
              if ((dInside < bestInsideDist)) {
                bestInsideDist = dInside;
                bestInsideCoord = sample.inside;
              }
            }
            if ((sample.outside.x >= 0f)) {
              let dOutside = distance(pos, (sample.outside * vec2f(size)));
              if ((dOutside < bestOutsideDist)) {
                bestOutsideDist = dOutside;
                bestOutsideCoord = sample.outside;
              }
            }
          }
        }
        // unrolled iteration #2
        {
          // unrolled iteration #0
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((1i * offset), (-1i * offset)));
            if ((sample.inside.x >= 0f)) {
              let dInside = distance(pos, (sample.inside * vec2f(size)));
              if ((dInside < bestInsideDist)) {
                bestInsideDist = dInside;
                bestInsideCoord = sample.inside;
              }
            }
            if ((sample.outside.x >= 0f)) {
              let dOutside = distance(pos, (sample.outside * vec2f(size)));
              if ((dOutside < bestOutsideDist)) {
                bestOutsideDist = dOutside;
                bestOutsideCoord = sample.outside;
              }
            }
          }
          // unrolled iteration #1
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((1i * offset), (0i * offset)));
            if ((sample.inside.x >= 0f)) {
              let dInside = distance(pos, (sample.inside * vec2f(size)));
              if ((dInside < bestInsideDist)) {
                bestInsideDist = dInside;
                bestInsideCoord = sample.inside;
              }
            }
            if ((sample.outside.x >= 0f)) {
              let dOutside = distance(pos, (sample.outside * vec2f(size)));
              if ((dOutside < bestOutsideDist)) {
                bestOutsideDist = dOutside;
                bestOutsideCoord = sample.outside;
              }
            }
          }
          // unrolled iteration #2
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((1i * offset), (1i * offset)));
            if ((sample.inside.x >= 0f)) {
              let dInside = distance(pos, (sample.inside * vec2f(size)));
              if ((dInside < bestInsideDist)) {
                bestInsideDist = dInside;
                bestInsideCoord = sample.inside;
              }
            }
            if ((sample.outside.x >= 0f)) {
              let dOutside = distance(pos, (sample.outside * vec2f(size)));
              if ((dOutside < bestOutsideDist)) {
                bestOutsideDist = dOutside;
                bestOutsideCoord = sample.outside;
              }
            }
          }
        }
        textureStore(writeView, vec2i(i32(x), i32(y)), vec4f(bestInsideCoord, bestOutsideCoord));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(1) @binding(1) var readView: texture_storage_2d<rgba16float, read>;

      @group(2) @binding(0) var distTexture: texture_storage_2d<rgba16float, write>;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        var pos = vec2f(f32(x), f32(y));
        var size = textureDimensions(readView);
        var texel = textureLoad(readView, vec2i(i32(x), i32(y)));
        var insideCoord = texel.xy;
        var outsideCoord = texel.zw;
        var insideDist = 1e+20;
        var outsideDist = 1e+20;
        if ((insideCoord.x >= 0f)) {
          insideDist = distance(pos, (insideCoord * vec2f(size)));
        }
        if ((outsideCoord.x >= 0f)) {
          outsideDist = distance(pos, (outsideCoord * vec2f(size)));
        }
        let signedDist = (insideDist - outsideDist);
        textureStore(distTexture, vec2i(i32(x), i32(y)), vec4f(signedDist, 0f, 0f, 0f));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      struct fullScreenTriangle_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(in: fullScreenTriangle_Input) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      @group(1) @binding(0) var distTexture: texture_2d<f32>;

      @group(1) @binding(1) var sampler_1: sampler;

      struct VisualizationParams {
        showInside: u32,
        showOutside: u32,
      }

      @group(0) @binding(0) var<uniform> paramsUniform: VisualizationParams;

      const outsideGradient: array<vec3f, 5> = array<vec3f, 5>(vec3f(0.05000000074505806, 0.05000000074505806, 0.15000000596046448), vec3f(0.20000000298023224, 0.10000000149011612, 0.4000000059604645), vec3f(0.6000000238418579, 0.20000000298023224, 0.5), vec3f(0.949999988079071, 0.5, 0.30000001192092896), vec3f(1, 0.949999988079071, 0.800000011920929));

      const insideGradient: array<vec3f, 5> = array<vec3f, 5>(vec3f(0.05000000074505806, 0.05000000074505806, 0.15000000596046448), vec3f(0.10000000149011612, 0.20000000298023224, 0.30000001192092896), vec3f(0.20000000298023224, 0.44999998807907104, 0.550000011920929), vec3f(0.4000000059604645, 0.75, 0.699999988079071), vec3f(0.8999999761581421, 1, 0.949999988079071));

      struct distanceFrag_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn distanceFrag(_arg_0: distanceFrag_Input) -> @location(0) vec4f {
        var size = textureDimensions(distTexture);
        var dist = textureSample(distTexture, sampler_1, _arg_0.uv).x;
        if (((paramsUniform.showInside == 0u) && (dist < 0f))) {
          dist = 0f;
        }
        if (((paramsUniform.showOutside == 0u) && (dist > 0f))) {
          dist = 0f;
        }
        let unsigned = abs(dist);
        let maxDist = (f32(max(size.x, size.y)) * 0.25f);
        let t = saturate((unsigned / maxDist));
        let gradientPos = (t * 4f);
        let idx = u32(gradientPos);
        let frac = fract(gradientPos);
        var outsideBase = mix(outsideGradient[min(idx, 4u)], outsideGradient[min((idx + 1u), 4u)], frac);
        var insideBase = mix(insideGradient[min(idx, 4u)], insideGradient[min((idx + 1u), 4u)], frac);
        var baseColor = outsideBase;
        if ((dist < 0f)) {
          baseColor = insideBase;
        }
        let contourFreq = (maxDist / 12f);
        let contour = smoothstep(0f, 0.15f, abs((fract((unsigned / contourFreq)) - 0.5f)));
        var color = (baseColor * (0.7f + (0.3f * contour)));
        return vec4f(color, 1f);
      }"
    `);
  });
});
