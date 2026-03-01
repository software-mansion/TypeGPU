/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import {
  mock3DModelLoading,
  mockCreateImageBitmap,
  mockImageLoading,
  mockResizeObserver,
} from '../utils/commonMocks.ts';

describe('gravity example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simulation',
        name: 'gravity',
        setupMocks: () => {
          mockImageLoading();
          mock3DModelLoading();
          mockCreateImageBitmap();
          mockResizeObserver();
        },
        expectedCalls: 6,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "
      struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex
      fn vs_main(@builtin(vertex_index) i: u32) -> VertexOutput {
        const pos = array(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));
        return VertexOutput(vec4f(pos[i], 0, 1), uv[i]);
      }


      @group(0) @binding(0) var src: texture_2d<f32>;
      @group(0) @binding(1) var samp: sampler;

      @fragment
      fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
        return textureSample(src, samp, uv);
      }

      struct CelestialBody {
        destroyed: u32,
        position: vec3f,
        velocity: vec3f,
        mass: f32,
        radiusMultiplier: f32,
        collisionBehavior: u32,
        textureIndex: u32,
        ambientLightFactor: f32,
      }

      @group(0) @binding(1) var<storage, read> inState: array<CelestialBody>;

      @group(0) @binding(0) var<uniform> celestialBodiesCount: i32;

      fn radiusOf(body: CelestialBody) -> f32 {
        return (pow(((body.mass * 0.75f) / 3.141592653589793f), 0.333f) * body.radiusMultiplier);
      }

      fn isSmaller(currentId: u32, otherId: u32) -> bool {
        let current = (&inState[currentId]);
        let other = (&inState[otherId]);
        if (((*current).mass < (*other).mass)) {
          return true;
        }
        if (((*current).mass == (*other).mass)) {
          return (currentId < otherId);
        }
        return false;
      }

      @group(0) @binding(2) var<storage, read_write> outState: array<CelestialBody>;

      struct computeCollisionsShader_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn computeCollisionsShader(input: computeCollisionsShader_Input) {
        let currentId = input.gid.x;
        var current = inState[currentId];
        if ((current.destroyed == 0u)) {
          for (var otherId = 0u; (otherId < u32(celestialBodiesCount)); otherId++) {
            let other = (&inState[otherId]);
            if ((((((otherId == currentId) || ((*other).destroyed == 1u)) || (current.collisionBehavior == 0u)) || ((*other).collisionBehavior == 0u)) || (distance(current.position, (*other).position) >= (radiusOf(current) + radiusOf((*other)))))) {
              continue;
            }
            if (((current.collisionBehavior == 1u) && ((*other).collisionBehavior == 1u))) {
              if (isSmaller(currentId, otherId)) {
                var dir = normalize((current.position - (*other).position));
                current.position = ((*other).position + (dir * (radiusOf(current) + radiusOf((*other)))));
              }
              var posDiff = (current.position - (*other).position);
              var velDiff = (current.velocity - (*other).velocity);
              let posDiffFactor = ((((2f * (*other).mass) / (current.mass + (*other).mass)) * dot(velDiff, posDiff)) / dot(posDiff, posDiff));
              current.velocity = ((current.velocity - (posDiff * posDiffFactor)) * 0.99f);
            }
            else {
              let isCurrentAbsorbed = ((current.collisionBehavior == 1u) || ((current.collisionBehavior == 2u) && isSmaller(currentId, otherId)));
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
        outState[currentId] = current;
      }

      struct Time {
        passed: f32,
        multiplier: f32,
      }

      @group(0) @binding(0) var<uniform> time: Time;

      struct CelestialBody {
        destroyed: u32,
        position: vec3f,
        velocity: vec3f,
        mass: f32,
        radiusMultiplier: f32,
        collisionBehavior: u32,
        textureIndex: u32,
        ambientLightFactor: f32,
      }

      @group(1) @binding(1) var<storage, read> inState: array<CelestialBody>;

      @group(1) @binding(0) var<uniform> celestialBodiesCount: i32;

      fn radiusOf(body: CelestialBody) -> f32 {
        return (pow(((body.mass * 0.75f) / 3.141592653589793f), 0.333f) * body.radiusMultiplier);
      }

      @group(1) @binding(2) var<storage, read_write> outState: array<CelestialBody>;

      struct computeGravityShader_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn computeGravityShader(input: computeGravityShader_Input) {
        let dt = (time.passed * time.multiplier);
        let currentId = input.gid.x;
        var current = inState[currentId];
        if ((current.destroyed == 0u)) {
          for (var otherId = 0u; (otherId < u32(celestialBodiesCount)); otherId++) {
            let other = (&inState[otherId]);
            if (((otherId == currentId) || ((*other).destroyed == 1u))) {
              continue;
            }
            let dist = max((radiusOf(current) + radiusOf((*other))), distance(current.position, (*other).position));
            let gravityForce = (((current.mass * (*other).mass) / dist) / dist);
            var direction = normalize(((*other).position - current.position));
            current.velocity += ((direction * (gravityForce / current.mass)) * dt);
          }
          current.position += (current.velocity * dt);
        }
        outState[currentId] = current;
      }

      struct Camera {
        position: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
        viewInverse: mat4x4f,
        projectionInverse: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera: Camera;

      struct skyBoxVertex_Output {
        @builtin(position) pos: vec4f,
        @location(0) texCoord: vec3f,
      }

      struct skyBoxVertex_Input {
        @location(0) position: vec3f,
        @location(1) uv: vec2f,
      }

      @vertex fn skyBoxVertex(input: skyBoxVertex_Input) -> skyBoxVertex_Output {
        var viewPos = (camera.view * vec4f(input.position, 0f)).xyz;
        return skyBoxVertex_Output((camera.projection * vec4f(viewPos, 1f)), input.position.xyz);
      }

      @group(0) @binding(1) var skyBox: texture_cube<f32>;

      @group(0) @binding(2) var sampler_1: sampler;

      struct skyBoxFragment_Input {
        @location(0) texCoord: vec3f,
      }

      @fragment fn skyBoxFragment(input: skyBoxFragment_Input) -> @location(0) vec4f {
        return textureSample(skyBox, sampler_1, normalize(input.texCoord));
      }

      struct CelestialBody {
        destroyed: u32,
        position: vec3f,
        velocity: vec3f,
        mass: f32,
        radiusMultiplier: f32,
        collisionBehavior: u32,
        textureIndex: u32,
        ambientLightFactor: f32,
      }

      @group(1) @binding(1) var<storage, read> celestialBodies: array<CelestialBody>;

      fn radiusOf(body: CelestialBody) -> f32 {
        return (pow(((body.mass * 0.75f) / 3.141592653589793f), 0.333f) * body.radiusMultiplier);
      }

      struct Camera {
        position: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
        viewInverse: mat4x4f,
        projectionInverse: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera_1: Camera;

      struct mainVertex_Output {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) normals: vec3f,
        @location(2) worldPosition: vec3f,
        @location(3) @interpolate(flat) sphereTextureIndex: u32,
        @location(4) @interpolate(flat) destroyed: u32,
        @location(5) ambientLightFactor: f32,
      }

      struct mainVertex_Input {
        @location(0) position: vec3f,
        @location(1) normal: vec3f,
        @location(2) uv: vec2f,
        @builtin(instance_index) instanceIndex: u32,
      }

      @vertex fn mainVertex(input: mainVertex_Input) -> mainVertex_Output {
        let currentBody = (&celestialBodies[input.instanceIndex]);
        var worldPosition = ((*currentBody).position + (input.position.xyz * radiusOf((*currentBody))));
        let camera = (&camera_1);
        var positionOnCanvas = (((*camera).projection * (*camera).view) * vec4f(worldPosition, 1f));
        return mainVertex_Output(positionOnCanvas, input.uv, input.normal, worldPosition, (*currentBody).textureIndex, (*currentBody).destroyed, (*currentBody).ambientLightFactor);
      }

      @group(1) @binding(0) var celestialBodyTextures: texture_2d_array<f32>;

      @group(0) @binding(1) var sampler_1: sampler;

      @group(0) @binding(2) var<uniform> lightSource: vec3f;

      struct mainFragment_Input {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
        @location(1) normals: vec3f,
        @location(2) worldPosition: vec3f,
        @location(3) @interpolate(flat) sphereTextureIndex: u32,
        @location(4) @interpolate(flat) destroyed: u32,
        @location(5) ambientLightFactor: f32,
      }

      @fragment fn mainFragment(input: mainFragment_Input) -> @location(0) vec4f {
        if ((input.destroyed == 1u)) {
          discard;;
        }
        var lightColor = vec3f(1, 0.8999999761581421, 0.8999999761581421);
        var textureColor = textureSample(celestialBodyTextures, sampler_1, input.uv, input.sphereTextureIndex).rgb;
        var ambient = ((textureColor * lightColor) * input.ambientLightFactor);
        let normal = input.normals;
        var lightDirection = normalize((lightSource - input.worldPosition));
        let cosTheta = dot(normal, lightDirection);
        var diffuse = ((textureColor * lightColor) * max(0f, cosTheta));
        return vec4f((ambient + diffuse), 1f);
      }"
    `);
  });
});
