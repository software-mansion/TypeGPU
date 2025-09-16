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
        return (pow(((body.mass * 0.75) / 3.141592653589793f), 0.333) * body.radiusMultiplier);
      }

      fn isSmaller_5(currentId: u32, otherId: u32) -> bool {
        if ((inState_1[currentId].mass < inState_1[otherId].mass)) {
          return true;
        }
        if ((inState_1[currentId].mass == inState_1[otherId].mass)) {
          return (currentId < otherId);
        }
        return false;
      }

      @group(0) @binding(2) var<storage, read_write> outState_6: array<CelestialBody_2>;

      struct computeCollisionsShader_Input_7 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn computeCollisionsShader_0(input: computeCollisionsShader_Input_7) {
        var currentId = input.gid.x;
        var current = CelestialBody_2(inState_1[currentId].destroyed, inState_1[currentId].position, inState_1[currentId].velocity, inState_1[currentId].mass, inState_1[currentId].radiusMultiplier, inState_1[currentId].collisionBehavior, inState_1[currentId].textureIndex, inState_1[currentId].ambientLightFactor);
        var updatedCurrent = current;
        if ((current.destroyed == 0)) {
          for (var i = 0; (i < celestialBodiesCount_3); i++) {
            var otherId = u32(i);
            var other = CelestialBody_2(inState_1[otherId].destroyed, inState_1[otherId].position, inState_1[otherId].velocity, inState_1[otherId].mass, inState_1[otherId].radiusMultiplier, inState_1[otherId].collisionBehavior, inState_1[otherId].textureIndex, inState_1[otherId].ambientLightFactor);
            if ((((((u32(i) == input.gid.x) || (other.destroyed == 1)) || (current.collisionBehavior == 0)) || (other.collisionBehavior == 0)) || (distance(current.position, other.position) >= (radiusOf_4(current) + radiusOf_4(other))))) {
              continue;
            }
            if (((current.collisionBehavior == 1) && (other.collisionBehavior == 1))) {
              if (isSmaller_5(currentId, otherId)) {
                updatedCurrent.position = (other.position + ((radiusOf_4(current) + radiusOf_4(other)) * normalize((current.position - other.position))));
              }
              updatedCurrent.velocity = (0.99 * (updatedCurrent.velocity - (((((2 * other.mass) / (current.mass + other.mass)) * dot((current.velocity - other.velocity), (current.position - other.position))) / pow(distance(current.position, other.position), 2)) * (current.position - other.position))));
            }
            else {
              var isCurrentAbsorbed = ((current.collisionBehavior == 1) || ((current.collisionBehavior == 2) && isSmaller_5(currentId, otherId)));
              if (isCurrentAbsorbed) {
                updatedCurrent.destroyed = 1;
              }
              else {
                var m1 = updatedCurrent.mass;
                var m2 = other.mass;
                updatedCurrent.velocity = (((m1 / (m1 + m2)) * updatedCurrent.velocity) + ((m2 / (m1 + m2)) * other.velocity));
                updatedCurrent.mass = (m1 + m2);
              }
            }
          }
        }
        outState_6[input.gid.x] = updatedCurrent;
      }

      struct CelestialBody_10 {
        destroyed: u32,
        position: vec3f,
        velocity: vec3f,
        mass: f32,
        radiusMultiplier: f32,
        collisionBehavior: u32,
        textureIndex: u32,
        ambientLightFactor: f32,
      }

      @group(1) @binding(1) var<storage, read> inState_9: array<CelestialBody_10>;

      struct Time_12 {
        passed: f32,
        multiplier: f32,
      }

      @group(0) @binding(0) var<uniform> time_11: Time_12;

      @group(1) @binding(0) var<uniform> celestialBodiesCount_13: i32;

      fn radiusOf_14(body: CelestialBody_10) -> f32 {
        return (pow(((body.mass * 0.75) / 3.141592653589793f), 0.333) * body.radiusMultiplier);
      }

      @group(1) @binding(2) var<storage, read_write> outState_15: array<CelestialBody_10>;

      struct computeGravityShader_Input_16 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn computeGravityShader_8(input: computeGravityShader_Input_16) {
        var current = CelestialBody_10(inState_9[input.gid.x].destroyed, inState_9[input.gid.x].position, inState_9[input.gid.x].velocity, inState_9[input.gid.x].mass, inState_9[input.gid.x].radiusMultiplier, inState_9[input.gid.x].collisionBehavior, inState_9[input.gid.x].textureIndex, inState_9[input.gid.x].ambientLightFactor);
        var dt = (time_11.passed * time_11.multiplier);
        var updatedCurrent = current;
        if ((current.destroyed == 0)) {
          for (var i = 0; (i < celestialBodiesCount_13); i++) {
            var other = CelestialBody_10(inState_9[i].destroyed, inState_9[i].position, inState_9[i].velocity, inState_9[i].mass, inState_9[i].radiusMultiplier, inState_9[i].collisionBehavior, inState_9[i].textureIndex, inState_9[i].ambientLightFactor);
            if (((u32(i) == input.gid.x) || (other.destroyed == 1))) {
              continue;
            }
            var dist = max((radiusOf_14(current) + radiusOf_14(other)), distance(current.position, other.position));
            var gravityForce = (((current.mass * other.mass) / dist) / dist);
            var direction = normalize((other.position - current.position));
            updatedCurrent.velocity = (updatedCurrent.velocity + (((gravityForce / current.mass) * dt) * direction));
          }
          updatedCurrent.position = (updatedCurrent.position + (dt * updatedCurrent.velocity));
        }
        outState_15[input.gid.x] = updatedCurrent;
      }

      struct Camera_19 {
        position: vec3f,
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera_18: Camera_19;

      struct skyBoxVertex_Output_20 {
        @builtin(position) pos: vec4f,
        @location(0) texCoord: vec3f,
      }

      struct skyBoxVertex_Input_21 {
        @location(0) position: vec3f,
        @location(1) uv: vec2f,
      }

      @vertex fn skyBoxVertex_17(input: skyBoxVertex_Input_21) -> skyBoxVertex_Output_20 {
        var viewPos = (camera_18.view * vec4f(input.position, 0)).xyz;
        return skyBoxVertex_Output_20((camera_18.projection * vec4f(viewPos, 1)), input.position.xyz);
      }

      @group(0) @binding(1) var texture_23: texture_cube<f32>;

      @group(0) @binding(2) var sampler_24: sampler;

      struct skyBoxFragment_Input_25 {
        @location(0) texCoord: vec3f,
      }

      @fragment fn skyBoxFragment_22(input: skyBoxFragment_Input_25) -> @location(0) vec4f {
        return textureSample(texture_23, sampler_24, normalize(input.texCoord));
      }

      struct CelestialBody_28 {
        destroyed: u32,
        position: vec3f,
        velocity: vec3f,
        mass: f32,
        radiusMultiplier: f32,
        collisionBehavior: u32,
        textureIndex: u32,
        ambientLightFactor: f32,
      }

      @group(1) @binding(1) var<storage, read> celestialBodies_27: array<CelestialBody_28>;

      fn radiusOf_29(body: CelestialBody_28) -> f32 {
        return (pow(((body.mass * 0.75) / 3.141592653589793f), 0.333) * body.radiusMultiplier);
      }

      struct Camera_31 {
        position: vec3f,
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera_30: Camera_31;

      struct mainVertex_Output_32 {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) normals: vec3f,
        @location(2) worldPosition: vec3f,
        @location(3) @interpolate(flat) sphereTextureIndex: u32,
        @location(4) @interpolate(flat) destroyed: u32,
        @location(5) ambientLightFactor: f32,
      }

      struct mainVertex_Input_33 {
        @location(0) position: vec3f,
        @location(1) normal: vec3f,
        @location(2) uv: vec2f,
        @builtin(instance_index) instanceIndex: u32,
      }

      @vertex fn mainVertex_26(input: mainVertex_Input_33) -> mainVertex_Output_32 {
        var currentBody = CelestialBody_28(celestialBodies_27[input.instanceIndex].destroyed, celestialBodies_27[input.instanceIndex].position, celestialBodies_27[input.instanceIndex].velocity, celestialBodies_27[input.instanceIndex].mass, celestialBodies_27[input.instanceIndex].radiusMultiplier, celestialBodies_27[input.instanceIndex].collisionBehavior, celestialBodies_27[input.instanceIndex].textureIndex, celestialBodies_27[input.instanceIndex].ambientLightFactor);
        var worldPosition = ((radiusOf_29(currentBody) * input.position.xyz) + currentBody.position);
        var camera = camera_30;
        var positionOnCanvas = (camera.projection * (camera.view * vec4f(worldPosition, 1)));
        return mainVertex_Output_32(positionOnCanvas, input.uv, input.normal, worldPosition, currentBody.textureIndex, currentBody.destroyed, currentBody.ambientLightFactor);
      }

      @group(1) @binding(0) var celestialBodyTextures_35: texture_2d_array<f32>;

      @group(0) @binding(1) var sampler_36: sampler;

      @group(0) @binding(2) var<uniform> lightSource_37: vec3f;

      struct mainFragment_Input_38 {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) normals: vec3f,
        @location(2) worldPosition: vec3f,
        @location(3) @interpolate(flat) sphereTextureIndex: u32,
        @location(4) @interpolate(flat) destroyed: u32,
        @location(5) ambientLightFactor: f32,
      }

      @fragment fn mainFragment_34(input: mainFragment_Input_38) -> @location(0) vec4f {
        if ((input.destroyed == 1)) {
          discard;;
        }
        var lightColor = vec3f(1, 0.8999999761581421, 0.8999999761581421);
        var textureColor = textureSample(celestialBodyTextures_35, sampler_36, input.uv, input.sphereTextureIndex).xyz;
        var ambient = (input.ambientLightFactor * (textureColor * lightColor));
        var normal = input.normals;
        var lightDirection = normalize((lightSource_37 - input.worldPosition));
        var cosTheta = dot(normal, lightDirection);
        var diffuse = (max(0, cosTheta) * (textureColor * lightColor));
        var litColor = (ambient + diffuse);
        return vec4f(litColor.xyz, 1);
      }"
    `);
  });
});
