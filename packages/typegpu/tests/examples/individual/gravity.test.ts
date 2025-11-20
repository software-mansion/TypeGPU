/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import {
  mock3DModelLoading,
  mockImageLoading,
  mockResizeObserver,
} from '../utils/commonMocks.ts';

describe('gravity example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'gravity',
      setupMocks: () => {
        mockImageLoading();
        mock3DModelLoading();
        mockResizeObserver();
      },
      expectedCalls: 4,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct CelestialBody_2 {
        destroyed: u32,
        position: vec3f,
        velocity: vec3f,
        mass: f32,
        radiusMultiplier: f32,
        collisionBehavior: u32,
        textureIndex: u32,
        ambientLightFactor: f32,
      }

      @group(0) @binding(1) var<storage, read> inState_1: array<CelestialBody_2>;

      @group(0) @binding(0) var<uniform> celestialBodiesCount_3: i32;

      fn radiusOf_4(body: CelestialBody_2) -> f32 {
        return (pow(((body.mass * 0.75f) / 3.141592653589793f), 0.333f) * body.radiusMultiplier);
      }

      fn isSmaller_5(currentId: u32, otherId: u32) -> bool {
        let current = (&inState_1[currentId]);
        let other = (&inState_1[otherId]);
        if (((*current).mass < (*other).mass)) {
          return true;
        }
        if (((*current).mass == (*other).mass)) {
          return (currentId < otherId);
        }
        return false;
      }

      @group(0) @binding(2) var<storage, read_write> outState_6: array<CelestialBody_2>;

      struct computeCollisionsShader_Input_7 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn computeCollisionsShader_0(input: computeCollisionsShader_Input_7) {
        let currentId = input.gid.x;
        var current = inState_1[currentId];
        if ((current.destroyed == 0u)) {
          for (var otherId = 0u; (otherId < u32(celestialBodiesCount_3)); otherId++) {
            let other = (&inState_1[otherId]);
            if ((((((otherId == currentId) || ((*other).destroyed == 1u)) || (current.collisionBehavior == 0u)) || ((*other).collisionBehavior == 0u)) || (distance(current.position, (*other).position) >= (radiusOf_4(current) + radiusOf_4((*other)))))) {
              continue;
            }
            if (((current.collisionBehavior == 1u) && ((*other).collisionBehavior == 1u))) {
              if (isSmaller_5(currentId, otherId)) {
                var dir = normalize((current.position - (*other).position));
                current.position = ((*other).position + (dir * (radiusOf_4(current) + radiusOf_4((*other)))));
              }
              var posDiff = (current.position - (*other).position);
              var velDiff = (current.velocity - (*other).velocity);
              let posDiffFactor = ((((2f * (*other).mass) / (current.mass + (*other).mass)) * dot(velDiff, posDiff)) / dot(posDiff, posDiff));
              current.velocity = ((current.velocity - (posDiff * posDiffFactor)) * 0.99);
            }
            else {
              let isCurrentAbsorbed = ((current.collisionBehavior == 1u) || ((current.collisionBehavior == 2u) && isSmaller_5(currentId, otherId)));
              if (isCurrentAbsorbed) {
                current.destroyed = 1u;
              }
              else {
                let m1 = current.mass;
                let m2 = (*other).mass;
                current.velocity = ((current.velocity * (m1 / (m1 + m2))) + ((*other).velocity * (m2 / (m1 + m2))));
                current.mass = (m1 + m2);
              }
            }
          }
        }
        outState_6[currentId] = current;
      }

      struct Time_2 {
        passed: f32,
        multiplier: f32,
      }

      @group(0) @binding(0) var<uniform> time_1: Time_2;

      struct CelestialBody_4 {
        destroyed: u32,
        position: vec3f,
        velocity: vec3f,
        mass: f32,
        radiusMultiplier: f32,
        collisionBehavior: u32,
        textureIndex: u32,
        ambientLightFactor: f32,
      }

      @group(1) @binding(1) var<storage, read> inState_3: array<CelestialBody_4>;

      @group(1) @binding(0) var<uniform> celestialBodiesCount_5: i32;

      fn radiusOf_6(body: CelestialBody_4) -> f32 {
        return (pow(((body.mass * 0.75f) / 3.141592653589793f), 0.333f) * body.radiusMultiplier);
      }

      @group(1) @binding(2) var<storage, read_write> outState_7: array<CelestialBody_4>;

      struct computeGravityShader_Input_8 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn computeGravityShader_0(input: computeGravityShader_Input_8) {
        let dt = (time_1.passed * time_1.multiplier);
        let currentId = input.gid.x;
        var current = inState_3[currentId];
        if ((current.destroyed == 0u)) {
          for (var otherId = 0u; (otherId < u32(celestialBodiesCount_5)); otherId++) {
            let other = (&inState_3[otherId]);
            if (((otherId == currentId) || ((*other).destroyed == 1u))) {
              continue;
            }
            let dist = max((radiusOf_6(current) + radiusOf_6((*other))), distance(current.position, (*other).position));
            let gravityForce = (((current.mass * (*other).mass) / dist) / dist);
            var direction = normalize(((*other).position - current.position));
            current.velocity = (current.velocity + (direction * ((gravityForce / current.mass) * dt)));
          }
          current.position = (current.position + (current.velocity * dt));
        }
        outState_7[currentId] = current;
      }

      struct Camera_2 {
        position: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera_1: Camera_2;

      struct skyBoxVertex_Output_3 {
        @builtin(position) pos: vec4f,
        @location(0) texCoord: vec3f,
      }

      struct skyBoxVertex_Input_4 {
        @location(0) position: vec3f,
        @location(1) uv: vec2f,
      }

      @vertex fn skyBoxVertex_0(input: skyBoxVertex_Input_4) -> skyBoxVertex_Output_3 {
        var viewPos = (camera_1.view * vec4f(input.position, 0f)).xyz;
        return skyBoxVertex_Output_3((camera_1.projection * vec4f(viewPos, 1f)), input.position.xyz);
      }

      @group(0) @binding(1) var item_6: texture_cube<f32>;

      @group(0) @binding(2) var sampler_7: sampler;

      struct skyBoxFragment_Input_8 {
        @location(0) texCoord: vec3f,
      }

      @fragment fn skyBoxFragment_5(input: skyBoxFragment_Input_8) -> @location(0) vec4f {
        return textureSample(item_6, sampler_7, normalize(input.texCoord));
      }

      struct CelestialBody_2 {
        destroyed: u32,
        position: vec3f,
        velocity: vec3f,
        mass: f32,
        radiusMultiplier: f32,
        collisionBehavior: u32,
        textureIndex: u32,
        ambientLightFactor: f32,
      }

      @group(1) @binding(1) var<storage, read> celestialBodies_1: array<CelestialBody_2>;

      fn radiusOf_3(body: CelestialBody_2) -> f32 {
        return (pow(((body.mass * 0.75f) / 3.141592653589793f), 0.333f) * body.radiusMultiplier);
      }

      struct Camera_5 {
        position: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera_4: Camera_5;

      struct mainVertex_Output_6 {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) normals: vec3f,
        @location(2) worldPosition: vec3f,
        @location(3) @interpolate(flat) sphereTextureIndex: u32,
        @location(4) @interpolate(flat) destroyed: u32,
        @location(5) ambientLightFactor: f32,
      }

      struct mainVertex_Input_7 {
        @location(0) position: vec3f,
        @location(1) normal: vec3f,
        @location(2) uv: vec2f,
        @builtin(instance_index) instanceIndex: u32,
      }

      @vertex fn mainVertex_0(input: mainVertex_Input_7) -> mainVertex_Output_6 {
        let currentBody = (&celestialBodies_1[input.instanceIndex]);
        var worldPosition = ((*currentBody).position + (input.position.xyz * radiusOf_3((*currentBody))));
        let camera = (&camera_4);
        var positionOnCanvas = (((*camera).projection * (*camera).view) * vec4f(worldPosition, 1f));
        return mainVertex_Output_6(positionOnCanvas, input.uv, input.normal, worldPosition, (*currentBody).textureIndex, (*currentBody).destroyed, (*currentBody).ambientLightFactor);
      }

      @group(1) @binding(0) var celestialBodyTextures_9: texture_2d_array<f32>;

      @group(0) @binding(1) var sampler_10: sampler;

      @group(0) @binding(2) var<uniform> lightSource_11: vec3f;

      struct mainFragment_Input_12 {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) normals: vec3f,
        @location(2) worldPosition: vec3f,
        @location(3) @interpolate(flat) sphereTextureIndex: u32,
        @location(4) @interpolate(flat) destroyed: u32,
        @location(5) ambientLightFactor: f32,
      }

      @fragment fn mainFragment_8(input: mainFragment_Input_12) -> @location(0) vec4f {
        if ((input.destroyed == 1u)) {
          discard;;
        }
        var lightColor = vec3f(1, 0.8999999761581421, 0.8999999761581421);
        var textureColor = textureSample(celestialBodyTextures_9, sampler_10, input.uv, input.sphereTextureIndex).xyz;
        var ambient = ((textureColor * lightColor) * input.ambientLightFactor);
        let normal = input.normals;
        var lightDirection = normalize((lightSource_11 - input.worldPosition));
        let cosTheta = dot(normal, lightDirection);
        var diffuse = ((textureColor * lightColor) * max(0f, cosTheta));
        var litColor = (ambient + diffuse);
        return vec4f(litColor.xyz, 1f);
      }"
    `);
  });
});
