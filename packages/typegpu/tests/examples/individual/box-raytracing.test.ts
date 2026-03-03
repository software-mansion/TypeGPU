/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('box raytracing example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'box-raytracing',
        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Uniforms {
        canvasDims: vec2f,
        invViewMatrix: mat4x4f,
        materialDensity: f32,
        boxSize: f32,
      }

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      struct mainVertex_Output {
        @builtin(position) pos: vec4f,
        @location(0) rayWorldOrigin: vec3f,
      }

      struct mainVertex_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex(input: mainVertex_Input) -> mainVertex_Output {
        var pos = array<vec2f, 3>(vec2f(-1), vec2f(3, -1), vec2f(-1, 3));
        var rayWorldOrigin = (uniforms.invViewMatrix * vec4f(0, 0, 0, 1)).xyz;
        return mainVertex_Output(vec4f(pos[input.vertexIndex], 0f, 1f), rayWorldOrigin);
      }

      struct Ray {
        origin: vec3f,
        direction: vec3f,
      }

      struct AxisAlignedBounds {
        min: vec3f,
        max: vec3f,
      }

      struct IntersectionStruct {
        intersects: bool,
        tMin: f32,
        tMax: f32,
      }

      fn getBoxIntersection(bounds: AxisAlignedBounds, ray: Ray) -> IntersectionStruct{
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
          return IntersectionStruct();
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
          return IntersectionStruct();
        }

        if tMinZ > tMin {
          tMin = tMinZ;
        }

        if tMaxZ < tMax {
          tMax = tMaxZ;
        }

        return IntersectionStruct(tMin > 0 && tMax > 0, tMin, tMax);
      }

      struct BoxStruct {
        isActive: u32,
        albedo: vec3f,
      }

      @group(0) @binding(1) var<storage, read> boxMatrix: array<array<array<BoxStruct, 7>, 7>, 7>;

      fn linearToSrgb(linear: vec3f) -> vec3f {
        return select((12.92f * linear), ((1.055f * pow(linear, vec3f(0.4166666567325592))) - vec3f(0.054999999701976776)), (linear > vec3f(0.0031308000907301903)));
      }

      struct fragmentFunction_Input {
        @builtin(position) position: vec4f,
        @location(0) rayWorldOrigin: vec3f,
      }

      @fragment fn fragmentFunction(input: fragmentFunction_Input) -> @location(0) vec4f {
        var boxSize3 = vec3f(uniforms.boxSize);
        var halfBoxSize3 = (0.5f * boxSize3);
        var halfCanvasDims = (0.5f * uniforms.canvasDims);
        let minDim = min(uniforms.canvasDims.x, uniforms.canvasDims.y);
        var viewCoords = ((input.position.xy - halfCanvasDims) / minDim);
        var ray = Ray(input.rayWorldOrigin, (uniforms.invViewMatrix * vec4f(normalize(vec3f(viewCoords, 1f)), 0f)).xyz);
        var bigBoxIntersection = getBoxIntersection(AxisAlignedBounds((-1f * halfBoxSize3), (vec3f(7) + halfBoxSize3)), ray);
        if (!bigBoxIntersection.intersects) {
          discard;;
          return vec4f();
        }
        var density = 0f;
        var invColor = vec3f();
        var intersectionFound = false;
        for (var i = 0; (i < 7i); i++) {
          for (var j = 0; (j < 7i); j++) {
            for (var k = 0; (k < 7i); k++) {
              if ((boxMatrix[i][j][k].isActive == 0u)) {
                continue;
              }
              var ijkScaled = vec3f(f32(i), f32(j), f32(k));
              var intersection = getBoxIntersection(AxisAlignedBounds((ijkScaled - halfBoxSize3), (ijkScaled + halfBoxSize3)), ray);
              if (intersection.intersects) {
                let boxDensity = (max(0f, (intersection.tMax - intersection.tMin)) * pow(uniforms.materialDensity, 2f));
                density += boxDensity;
                invColor = (invColor + (boxDensity * (vec3f(1) / boxMatrix[i][j][k].albedo)));
                intersectionFound = true;
              }
            }
          }
        }
        var linear = (vec3f(1) / invColor);
        var srgb = linearToSrgb(linear);
        const gamma = 2.2;
        var corrected = pow(srgb, vec3f((1f / gamma)));
        if (intersectionFound) {
          return (min(density, 1f) * vec4f(min(corrected, vec3f(1)), 1f));
        }
        discard;;
        return vec4f();
      }"
    `);
  });
});
