/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('box raytracing example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'box-raytracing',
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Uniforms_2 {
        canvasDims: vec2f,
        invViewMatrix: mat4x4f,
        materialDensity: f32,
        boxSize: f32,
      }

      @group(0) @binding(0) var<uniform> uniforms_1: Uniforms_2;

      struct mainVertex_Output_3 {
        @builtin(position) pos: vec4f,
        @location(0) rayWorldOrigin: vec3f,
      }

      struct mainVertex_Input_4 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex_0(input: mainVertex_Input_4) -> mainVertex_Output_3 {
        var pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        var rayWorldOrigin = (uniforms_1.invViewMatrix * vec4f(0, 0, 0, 1)).xyz;
        return mainVertex_Output_3(vec4f(pos[input.vertexIndex], 0, 1), rayWorldOrigin);
      }

      struct Ray_6 {
        origin: vec3f,
        direction: vec3f,
      }

      struct AxisAlignedBounds_7 {
        min: vec3f,
        max: vec3f,
      }

      struct IntersectionStruct_9 {
        intersects: bool,
        tMin: f32,
        tMax: f32,
      }

      fn getBoxIntersection_8(bounds: AxisAlignedBounds_7, ray: Ray_6) -> IntersectionStruct_9{
        var tMin: f32;
        var tMax: f32;
        var tMinY: f32;
        var tMaxY: f32;
        var tMinZ: f32;
        var tMaxZ: f32;

        if (ray.direction.x >= 0) {
          tMin = (bounds.min.x - ray.origin.x) / ray.direction.x;
          tMax = (bounds.max.x - ray.origin.x) / ray.direction.x;
        } else {
          tMin = (bounds.max.x - ray.origin.x) / ray.direction.x;
          tMax = (bounds.min.x - ray.origin.x) / ray.direction.x;
        }

        if (ray.direction.y >= 0) {
          tMinY = (bounds.min.y - ray.origin.y) / ray.direction.y;
          tMaxY = (bounds.max.y - ray.origin.y) / ray.direction.y;
        } else {
          tMinY = (bounds.max.y - ray.origin.y) / ray.direction.y;
          tMaxY = (bounds.min.y - ray.origin.y) / ray.direction.y;
        }

        if (tMin > tMaxY) || (tMinY > tMax) {
          return IntersectionStruct_9();
        }

        if (tMinY > tMin) {
          tMin = tMinY;
        }

        if (tMaxY < tMax) {
          tMax = tMaxY;
        }

        if (ray.direction.z >= 0) {
          tMinZ = (bounds.min.z - ray.origin.z) / ray.direction.z;
          tMaxZ = (bounds.max.z - ray.origin.z) / ray.direction.z;
        } else {
          tMinZ = (bounds.max.z - ray.origin.z) / ray.direction.z;
          tMaxZ = (bounds.min.z - ray.origin.z) / ray.direction.z;
        }

        if (tMin > tMaxZ) || (tMinZ > tMax) {
          return IntersectionStruct_9();
        }

        if tMinZ > tMin {
          tMin = tMinZ;
        }

        if tMaxZ < tMax {
          tMax = tMaxZ;
        }

        return IntersectionStruct_9(tMin > 0 && tMax > 0, tMin, tMax);
      }

      struct BoxStruct_11 {
        isActive: u32,
        albedo: vec3f,
      }

      @group(0) @binding(1) var<storage, read> boxMatrix_10: array<array<array<BoxStruct_11, 7>, 7>, 7>;

      fn linearToSrgb_12(linear: vec3f) -> vec3f {
        return select((12.92 * linear), ((1.055 * pow(linear, vec3f(0.4166666567325592))) - vec3f(0.054999999701976776)), (linear > vec3f(0.0031308000907301903)));
      }

      struct fragmentFunction_Input_13 {
        @builtin(position) position: vec4f,
        @location(0) rayWorldOrigin: vec3f,
      }

      @fragment fn fragmentFunction_5(input: fragmentFunction_Input_13) -> @location(0) vec4f {
        var boxSize3 = vec3f(uniforms_1.boxSize);
        var halfBoxSize3 = (0.5 * boxSize3);
        var halfCanvasDims = (0.5 * uniforms_1.canvasDims);
        var minDim = min(uniforms_1.canvasDims.x, uniforms_1.canvasDims.y);
        var viewCoords = ((input.position.xy - halfCanvasDims) / minDim);
        var ray = Ray_6(input.rayWorldOrigin, (uniforms_1.invViewMatrix * vec4f(normalize(vec3f(viewCoords, 1)), 0)).xyz);
        var bigBoxIntersection = getBoxIntersection_8(AxisAlignedBounds_7((-1 * halfBoxSize3), (vec3f(7) + halfBoxSize3)), ray);
        if (!bigBoxIntersection.intersects) {
          discard;;
          return vec4f();
        }
        var density = 0f;
        var invColor = vec3f();
        var tMin = 0f;
        var intersectionFound = false;
        for (var i = 0; (i < 7); i++) {
          for (var j = 0; (j < 7); j++) {
            for (var k = 0; (k < 7); k++) {
              if ((boxMatrix_10[i][j][k].isActive == 0)) {
                continue;
              }
              var ijkScaled = vec3f(f32(i), f32(j), f32(k));
              var intersection = getBoxIntersection_8(AxisAlignedBounds_7((ijkScaled - halfBoxSize3), (ijkScaled + halfBoxSize3)), ray);
              if (intersection.intersects) {
                var boxDensity = (max(0, (intersection.tMax - intersection.tMin)) * pow(uniforms_1.materialDensity, 2));
                density += boxDensity;
                invColor = (invColor + (boxDensity * (vec3f(1) / boxMatrix_10[i][j][k].albedo)));
                tMin = intersection.tMin;
                intersectionFound = true;
              }
            }
          }
        }
        var linear = (vec3f(1) / invColor);
        var srgb = linearToSrgb_12(linear);
        var gamma = 2.2;
        var corrected = pow(srgb, vec3f((1f / gamma)));
        if (intersectionFound) {
          return (min(density, 1) * vec4f(min(corrected, vec3f(1)), 1));
        }
        discard;;
        return vec4f();
      }"
    `);
  });
});
