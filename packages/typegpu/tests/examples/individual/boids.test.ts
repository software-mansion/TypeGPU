/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('boids example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'boids',
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct TriangleInfoStruct {
        position: vec2f,
        velocity: vec2f,
      }

      @group(0) @binding(0) var<uniform> trianglePos: array<TriangleInfoStruct, 1000>;

      @group(0) @binding(1) var<uniform> colorPalette: vec3f;
        struct VertexOutput {
          @builtin(position) position : vec4f,
          @location(1) color : vec4f,
        };

        @vertex
        fn mainVert(@builtin(instance_index) ii: u32, @location(0) v: vec2f) -> VertexOutput {
          let instanceInfo = trianglePos[ii];

          let angle = getRotationFromVelocity(instanceInfo.velocity);
          let rotated = rotate(v, angle);

          let offset = instanceInfo.position;
          let pos = vec4(rotated + offset, 0.0, 1.0);

          let color = vec4(
              sin(angle + colorPalette.r) * 0.45 + 0.45,
              sin(angle + colorPalette.g) * 0.45 + 0.45,
              sin(angle + colorPalette.b) * 0.45 + 0.45,
              1.0);

          return VertexOutput(pos, color);
        }

        @fragment
        fn mainFrag(@location(1) color : vec4f) -> @location(0) vec4f {
          return color;
        }

        fn rotate(v: vec2f, angle: f32) -> vec2f {
          let pos = vec2(
            (v.x * cos(angle)) - (v.y * sin(angle)),
            (v.x * sin(angle)) + (v.y * cos(angle))
          );
          return pos;
        };

        fn getRotationFromVelocity(velocity: vec2f) -> f32 {
          return -atan2(velocity.x, velocity.y);
        };


      struct TriangleInfoStruct {
        position: vec2f,
        velocity: vec2f,
      }

      @group(0) @binding(0) var<uniform> currentTrianglePos: array<TriangleInfoStruct, 1000>;

      @group(0) @binding(1) var<storage, read_write> nextTrianglePos: array<TriangleInfoStruct, 1000>;

      struct Params {
        separationDistance: f32,
        separationStrength: f32,
        alignmentDistance: f32,
        alignmentStrength: f32,
        cohesionDistance: f32,
        cohesionStrength: f32,
      }

      @group(0) @binding(2) var<storage, read> params: Params;
        @compute @workgroup_size(1)
        fn mainCompute(@builtin(global_invocation_id) gid: vec3u) {
          let index = gid.x;
          var instanceInfo = currentTrianglePos[index];
          var separation = vec2(0.0, 0.0);
          var alignment = vec2(0.0, 0.0);
          var alignmentCount = 0u;
          var cohesion = vec2(0.0, 0.0);
          var cohesionCount = 0u;
          for (var i = 0u; i < 1000; i = i + 1) {
            if (i == index) {
              continue;
            }
            var other = currentTrianglePos[i];
            var dist = distance(instanceInfo.position, other.position);
            if (dist < params.separationDistance) {
              separation += instanceInfo.position - other.position;
            }
            if (dist < params.alignmentDistance) {
              alignment += other.velocity;
              alignmentCount++;
            }
            if (dist < params.cohesionDistance) {
              cohesion += other.position;
              cohesionCount++;
            }
          };
          if (alignmentCount > 0u) {
            alignment = alignment / f32(alignmentCount);
          }
          if (cohesionCount > 0u) {
            cohesion = (cohesion / f32(cohesionCount)) - instanceInfo.position;
          }
          instanceInfo.velocity +=
            (separation * params.separationStrength)
            + (alignment * params.alignmentStrength)
            + (cohesion * params.cohesionStrength);
          instanceInfo.velocity = normalize(instanceInfo.velocity) * clamp(length(instanceInfo.velocity), 0.0, 0.01);
          let triangleSize = 0.03;
          if (instanceInfo.position[0] > 1.0 + triangleSize) {
            instanceInfo.position[0] = -1.0 - triangleSize;
          }
          if (instanceInfo.position[1] > 1.0 + triangleSize) {
            instanceInfo.position[1] = -1.0 - triangleSize;
          }
          if (instanceInfo.position[0] < -1.0 - triangleSize) {
            instanceInfo.position[0] = 1.0 + triangleSize;
          }
          if (instanceInfo.position[1] < -1.0 - triangleSize) {
            instanceInfo.position[1] = 1.0 + triangleSize;
          }
          instanceInfo.position += instanceInfo.velocity;
          nextTrianglePos[index] = instanceInfo;
        }
      "
    `);
  });
});
