/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('ascii filter example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'image-processing',
      name: 'ascii-filter',
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct fullScreenTriangle_Input_1 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle_0(in: fullScreenTriangle_Input_1) -> fullScreenTriangle_Output_2 {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output_2(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> uvTransformBuffer_4: mat2x2f;

      @group(1) @binding(0) var externalTexture_5: texture_external;

      @group(0) @binding(1) var<uniform> glyphSize_6: u32;

      @group(0) @binding(2) var shaderSampler_7: sampler;

      @group(0) @binding(3) var<uniform> gammaCorrection_8: f32;

      @group(0) @binding(4) var<uniform> charsetExtended_9: u32;

      fn characterFn_10(n: u32, p: vec2f) -> f32 {
        var pos = floor(((p * vec2f(-4, 4)) + 2.5));
        if (((((pos.x < 0) || (pos.x > 4)) || (pos.y < 0)) || (pos.y > 4))) {
          return 0;
        }
        var a = u32((pos.x + (5 * pos.y)));
        return f32(((n >> a) & 1));
      }

      @group(0) @binding(5) var<uniform> displayMode_11: u32;

      struct fragmentFn_Input_12 {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentFn_3(input: fragmentFn_Input_12) -> @location(0) vec4f {
        var uv2 = ((uvTransformBuffer_4 * (input.uv - 0.5)) + 0.5);
        var textureSize = vec2f(textureDimensions(externalTexture_5));
        var pix = (uv2 * textureSize);
        var cellSize = f32(glyphSize_6);
        var halfCell = (cellSize * 0.5);
        var blockCoord = ((floor((pix / cellSize)) * cellSize) / textureSize);
        var color = textureSampleBaseClampToEdge(externalTexture_5, shaderSampler_7, blockCoord);
        var rawGray = (((0.3 * color.x) + (0.59 * color.y)) + (0.11 * color.z));
        var gray = pow(rawGray, gammaCorrection_8);
        var n = 4096u;
        if ((charsetExtended_9 == 0)) {
          if ((gray > 0.2)) {
            n = 65600;
          }
          if ((gray > 0.3)) {
            n = 163153;
          }
          if ((gray > 0.4)) {
            n = 15255086;
          }
          if ((gray > 0.5)) {
            n = 13121101;
          }
          if ((gray > 0.6)) {
            n = 15252014;
          }
          if ((gray > 0.7)) {
            n = 13195790;
          }
          if ((gray > 0.8)) {
            n = 11512810;
          }
        }
        else {
          if ((gray > 0.0233)) {
            n = 4096;
          }
          if ((gray > 0.0465)) {
            n = 131200;
          }
          if ((gray > 0.0698)) {
            n = 4329476;
          }
          if ((gray > 0.093)) {
            n = 459200;
          }
          if ((gray > 0.1163)) {
            n = 4591748;
          }
          if ((gray > 0.1395)) {
            n = 12652620;
          }
          if ((gray > 0.1628)) {
            n = 14749828;
          }
          if ((gray > 0.186)) {
            n = 18393220;
          }
          if ((gray > 0.2093)) {
            n = 15239300;
          }
          if ((gray > 0.2326)) {
            n = 17318431;
          }
          if ((gray > 0.2558)) {
            n = 32641156;
          }
          if ((gray > 0.2791)) {
            n = 18393412;
          }
          if ((gray > 0.3023)) {
            n = 18157905;
          }
          if ((gray > 0.3256)) {
            n = 17463428;
          }
          if ((gray > 0.3488)) {
            n = 14954572;
          }
          if ((gray > 0.3721)) {
            n = 13177118;
          }
          if ((gray > 0.3953)) {
            n = 6566222;
          }
          if ((gray > 0.4186)) {
            n = 16269839;
          }
          if ((gray > 0.4419)) {
            n = 18444881;
          }
          if ((gray > 0.4651)) {
            n = 18400814;
          }
          if ((gray > 0.4884)) {
            n = 33061392;
          }
          if ((gray > 0.5116)) {
            n = 15255086;
          }
          if ((gray > 0.5349)) {
            n = 32045584;
          }
          if ((gray > 0.5581)) {
            n = 18405034;
          }
          if ((gray > 0.5814)) {
            n = 15022158;
          }
          if ((gray > 0.6047)) {
            n = 15018318;
          }
          if ((gray > 0.6279)) {
            n = 16272942;
          }
          if ((gray > 0.6512)) {
            n = 18415153;
          }
          if ((gray > 0.6744)) {
            n = 32641183;
          }
          if ((gray > 0.6977)) {
            n = 32540207;
          }
          if ((gray > 0.7209)) {
            n = 18732593;
          }
          if ((gray > 0.7442)) {
            n = 18667121;
          }
          if ((gray > 0.7674)) {
            n = 16267326;
          }
          if ((gray > 0.7907)) {
            n = 32575775;
          }
          if ((gray > 0.814)) {
            n = 15022414;
          }
          if ((gray > 0.8372)) {
            n = 15255537;
          }
          if ((gray > 0.8605)) {
            n = 32032318;
          }
          if ((gray > 0.8837)) {
            n = 32045617;
          }
          if ((gray > 0.907)) {
            n = 33081316;
          }
          if ((gray > 0.9302)) {
            n = 32045630;
          }
          if ((gray > 0.9535)) {
            n = 33061407;
          }
          if ((gray > 0.9767)) {
            n = 11512810;
          }
        }
        var p = vec2f((((pix.x / halfCell) % 2) - 1), (((pix.y / halfCell) % 2) - 1));
        var charValue = characterFn_10(n, p);
        var resultColor = vec3f(1);
        if ((displayMode_11 == 0)) {
          resultColor = (color * charValue).xyz;
        }
        if ((displayMode_11 == 1)) {
          resultColor = vec3f((gray * charValue));
        }
        if ((displayMode_11 == 2)) {
          resultColor = vec3f(charValue);
        }
        return vec4f(resultColor, 1);
      }"
    `);
  });
});
