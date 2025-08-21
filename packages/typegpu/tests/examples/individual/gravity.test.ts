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
      waitForAsync: true,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct computeCollisionsShader_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      struct CelestialBody_3 {
        destroyed: u32,
        position: vec3f,
        velocity: vec3f,
        mass: f32,
        radiusMultiplier: f32,
        collisionBehavior: u32,
        textureIndex: u32,
        ambientLightFactor: f32,
      }

      @group(0) @binding(1) var<storage, read> inState_2: array<CelestialBody_3>;

      @group(0) @binding(0) var<uniform> celestialBodiesCount_4: i32;

      fn radiusOf_5(body: CelestialBody_3) -> f32 {
        return (pow(((body.mass * 0.75) / 3.141592653589793f), 0.333) * body.radiusMultiplier);
      }

      fn isSmaller_6(currentId: u32, otherId: u32) -> bool {
        if ((inState_2[currentId].mass < inState_2[otherId].mass)) {
          return true;
        }
        if ((inState_2[currentId].mass == inState_2[otherId].mass)) {
          return (currentId < otherId);
        }
        return false;
      }

      @group(0) @binding(2) var<storage, read_write> outState_7: array<CelestialBody_3>;

      @compute @workgroup_size(1) fn computeCollisionsShader_0(input: computeCollisionsShader_Input_1) {
        var currentId = input.gid.x;
        var current = CelestialBody_3(inState_2[currentId].destroyed, inState_2[currentId].position, inState_2[currentId].velocity, inState_2[currentId].mass, inState_2[currentId].radiusMultiplier, inState_2[currentId].collisionBehavior, inState_2[currentId].textureIndex, inState_2[currentId].ambientLightFactor);
        var updatedCurrent = current;
        if ((current.destroyed == 0)) {
          for (var i = 0; (i < celestialBodiesCount_4); i++) {
            var otherId = u32(i);
            var other = CelestialBody_3(inState_2[otherId].destroyed, inState_2[otherId].position, inState_2[otherId].velocity, inState_2[otherId].mass, inState_2[otherId].radiusMultiplier, inState_2[otherId].collisionBehavior, inState_2[otherId].textureIndex, inState_2[otherId].ambientLightFactor);
            if ((((((u32(i) == input.gid.x) || (other.destroyed == 1)) || (current.collisionBehavior == 0)) || (other.collisionBehavior == 0)) || (distance(current.position, other.position) >= (radiusOf_5(current) + radiusOf_5(other))))) {
              continue;
            }
            if (((current.collisionBehavior == 1) && (other.collisionBehavior == 1))) {
              if (isSmaller_6(currentId, otherId)) {
                updatedCurrent.position = (other.position + ((radiusOf_5(current) + radiusOf_5(other)) * normalize((current.position - other.position))));
              }
              updatedCurrent.velocity = (0.99 * (updatedCurrent.velocity - (((((2 * other.mass) / (current.mass + other.mass)) * dot((current.velocity - other.velocity), (current.position - other.position))) / pow(distance(current.position, other.position), 2)) * (current.position - other.position))));
            }
            else {
              var isCurrentAbsorbed = ((current.collisionBehavior == 1) || ((current.collisionBehavior == 2) && isSmaller_6(currentId, otherId)));
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
        outState_7[input.gid.x] = updatedCurrent;
      }

      struct computeGravityShader_Input_9 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      struct CelestialBody_11 {
        destroyed: u32,
        position: vec3f,
        velocity: vec3f,
        mass: f32,
        radiusMultiplier: f32,
        collisionBehavior: u32,
        textureIndex: u32,
        ambientLightFactor: f32,
      }

      @group(1) @binding(1) var<storage, read> inState_10: array<CelestialBody_11>;

      struct Time_13 {
        passed: f32,
        multiplier: f32,
      }

      @group(0) @binding(0) var<uniform> time_12: Time_13;

      @group(1) @binding(0) var<uniform> celestialBodiesCount_14: i32;

      fn radiusOf_15(body: CelestialBody_11) -> f32 {
        return (pow(((body.mass * 0.75) / 3.141592653589793f), 0.333) * body.radiusMultiplier);
      }

      @group(1) @binding(2) var<storage, read_write> outState_16: array<CelestialBody_11>;

      @compute @workgroup_size(1) fn computeGravityShader_8(input: computeGravityShader_Input_9) {
        var current = CelestialBody_11(inState_10[input.gid.x].destroyed, inState_10[input.gid.x].position, inState_10[input.gid.x].velocity, inState_10[input.gid.x].mass, inState_10[input.gid.x].radiusMultiplier, inState_10[input.gid.x].collisionBehavior, inState_10[input.gid.x].textureIndex, inState_10[input.gid.x].ambientLightFactor);
        var dt = (time_12.passed * time_12.multiplier);
        var updatedCurrent = current;
        if ((current.destroyed == 0)) {
          for (var i = 0; (i < celestialBodiesCount_14); i++) {
            var other = CelestialBody_11(inState_10[i].destroyed, inState_10[i].position, inState_10[i].velocity, inState_10[i].mass, inState_10[i].radiusMultiplier, inState_10[i].collisionBehavior, inState_10[i].textureIndex, inState_10[i].ambientLightFactor);
            if (((u32(i) == input.gid.x) || (other.destroyed == 1))) {
              continue;
            }
            var dist = max((radiusOf_15(current) + radiusOf_15(other)), distance(current.position, other.position));
            var gravityForce = (((current.mass * other.mass) / dist) / dist);
            var direction = normalize((other.position - current.position));
            updatedCurrent.velocity = (updatedCurrent.velocity + (((gravityForce / current.mass) * dt) * direction));
          }
          updatedCurrent.position = (updatedCurrent.position + (dt * updatedCurrent.velocity));
        }
        outState_16[input.gid.x] = updatedCurrent;
      }

      struct skyBoxVertex_Input_18 {
        @location(0) position: vec3f,
        @location(1) uv: vec2f,
      }

      struct skyBoxVertex_Output_19 {
        @builtin(position) pos: vec4f,
        @location(0) texCoord: vec3f,
      }

      struct Camera_21 {
        position: vec3f,
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera_20: Camera_21;

      @vertex fn skyBoxVertex_17(input: skyBoxVertex_Input_18) -> skyBoxVertex_Output_19 {
        var viewPos = (camera_20.view * vec4f(input.position, 0)).xyz;
        return skyBoxVertex_Output_19((camera_20.projection * vec4f(viewPos, 1)), input.position.xyz);
      }

      struct skyBoxFragment_Input_23 {
        @location(0) texCoord: vec3f,
      }

      @group(0) @binding(1) var texture_24: texture_cube<f32>;

      @group(0) @binding(2) var sampler_25: sampler;

      @fragment fn skyBoxFragment_22(input: skyBoxFragment_Input_23) -> @location(0) vec4f {
        return textureSample(texture_24, sampler_25, normalize(input.texCoord));
      }

      struct mainVertex_Input_27 {
        @location(0) position: vec3f,
        @location(1) normal: vec3f,
        @location(2) uv: vec2f,
        @builtin(instance_index) instanceIndex: u32,
      }

      struct mainVertex_Output_28 {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) normals: vec3f,
        @location(2) worldPosition: vec3f,
        @location(3) @interpolate(flat) sphereTextureIndex: u32,
        @location(4) @interpolate(flat) destroyed: u32,
        @location(5) ambientLightFactor: f32,
      }

      struct CelestialBody_30 {
        destroyed: u32,
        position: vec3f,
        velocity: vec3f,
        mass: f32,
        radiusMultiplier: f32,
        collisionBehavior: u32,
        textureIndex: u32,
        ambientLightFactor: f32,
      }

      @group(1) @binding(1) var<storage, read> celestialBodies_29: array<CelestialBody_30>;

      fn radiusOf_31(body: CelestialBody_30) -> f32 {
        return (pow(((body.mass * 0.75) / 3.141592653589793f), 0.333) * body.radiusMultiplier);
      }

      struct Camera_33 {
        position: vec3f,
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera_32: Camera_33;

      @vertex fn mainVertex_26(input: mainVertex_Input_27) -> mainVertex_Output_28 {
        var currentBody = CelestialBody_30(celestialBodies_29[input.instanceIndex].destroyed, celestialBodies_29[input.instanceIndex].position, celestialBodies_29[input.instanceIndex].velocity, celestialBodies_29[input.instanceIndex].mass, celestialBodies_29[input.instanceIndex].radiusMultiplier, celestialBodies_29[input.instanceIndex].collisionBehavior, celestialBodies_29[input.instanceIndex].textureIndex, celestialBodies_29[input.instanceIndex].ambientLightFactor);
        var worldPosition = ((radiusOf_31(currentBody) * input.position.xyz) + currentBody.position);
        var camera = camera_32;
        var positionOnCanvas = (camera.projection * (camera.view * vec4f(worldPosition, 1)));
        return mainVertex_Output_28(positionOnCanvas, input.uv, input.normal, worldPosition, currentBody.textureIndex, currentBody.destroyed, currentBody.ambientLightFactor);
      }

      struct mainFragment_Input_35 {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) normals: vec3f,
        @location(2) worldPosition: vec3f,
        @location(3) @interpolate(flat) sphereTextureIndex: u32,
        @location(4) @interpolate(flat) destroyed: u32,
        @location(5) ambientLightFactor: f32,
      }

      @group(1) @binding(0) var celestialBodyTextures_36: texture_2d_array<f32>;

      @group(0) @binding(1) var sampler_37: sampler;

      @group(0) @binding(2) var<uniform> lightSource_38: vec3f;

      @fragment fn mainFragment_34(input: mainFragment_Input_35) -> @location(0) vec4f {
        if ((input.destroyed == 1)) {
          discard;;
        }
        var lightColor = vec3f(1, 0.8999999761581421, 0.8999999761581421);
        var textureColor = textureSample(celestialBodyTextures_36, sampler_37, input.uv, input.sphereTextureIndex).xyz;
        var ambient = (input.ambientLightFactor * (textureColor * lightColor));
        var normal = input.normals;
        var lightDirection = normalize((lightSource_38 - input.worldPosition));
        var cosTheta = dot(normal, lightDirection);
        var diffuse = (max(0, cosTheta) * (textureColor * lightColor));
        var litColor = (ambient + diffuse);
        return vec4f(litColor.xyz, 1);
      }"
    `);
  });
});
