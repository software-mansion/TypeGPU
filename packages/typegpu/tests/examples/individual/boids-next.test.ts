/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('boids next example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'boids-next',
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct mainCompute_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      struct TriangleData_3 {
        position: vec2f,
        velocity: vec2f,
      }

      @group(1) @binding(0) var<storage, read> currentTrianglePos_2: array<TriangleData_3>;

      struct Params_5 {
        separationDistance: f32,
        separationStrength: f32,
        alignmentDistance: f32,
        alignmentStrength: f32,
        cohesionDistance: f32,
        cohesionStrength: f32,
      }

      @group(0) @binding(0) var<uniform> paramsBuffer_4: Params_5;

      @group(1) @binding(1) var<storage, read_write> nextTrianglePos_6: array<TriangleData_3>;

      @compute @workgroup_size(1) fn mainCompute_0(input: mainCompute_Input_1) {
        var index = input.gid.x;
        var instanceInfo = currentTrianglePos_2[index];
        var separation = vec2f();
        var alignment = vec2f();
        var cohesion = vec2f();
        var alignmentCount = 0;
        var cohesionCount = 0;
        for (var i = u32(0); (i < arrayLength(&currentTrianglePos_2)); i++) {
          if ((i == index)) {
            continue;
          }
          var other = currentTrianglePos_2[i];
          var dist = distance(instanceInfo.position, other.position);
          if ((dist < paramsBuffer_4.separationDistance)) {
            separation = (separation + (instanceInfo.position - other.position));
          }
          if ((dist < paramsBuffer_4.alignmentDistance)) {
            alignment = (alignment + other.velocity);
            alignmentCount++;
          }
          if ((dist < paramsBuffer_4.cohesionDistance)) {
            cohesion = (cohesion + other.position);
            cohesionCount++;
          }
        }
        if ((alignmentCount > 0)) {
          alignment = ((1f / f32(alignmentCount)) * alignment);
        }
        if ((cohesionCount > 0)) {
          cohesion = ((1f / f32(cohesionCount)) * cohesion);
          cohesion = (cohesion - instanceInfo.position);
        }
        var velocity = (paramsBuffer_4.separationStrength * separation);
        velocity = (velocity + (paramsBuffer_4.alignmentStrength * alignment));
        velocity = (velocity + (paramsBuffer_4.cohesionStrength * cohesion));
        instanceInfo.velocity = (instanceInfo.velocity + velocity);
        instanceInfo.velocity = (clamp(length(instanceInfo.velocity), 0, 0.01) * normalize(instanceInfo.velocity));
        if ((instanceInfo.position.x > 1.03)) {
          instanceInfo.position.x = (-1 - 0.03);
        }
        if ((instanceInfo.position.y > 1.03)) {
          instanceInfo.position.y = (-1 - 0.03);
        }
        if ((instanceInfo.position.x < (-1 - 0.03))) {
          instanceInfo.position.x = 1.03;
        }
        if ((instanceInfo.position.y < (-1 - 0.03))) {
          instanceInfo.position.y = 1.03;
        }
        instanceInfo.position = (instanceInfo.position + instanceInfo.velocity);
        nextTrianglePos_6[index] = instanceInfo;
      }

      struct mainVert_Input_8 {
        @location(0) v: vec2f,
        @location(1) center: vec2f,
        @location(2) velocity: vec2f,
      }

      struct mainVert_Output_9 {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      fn getRotationFromVelocity_10(velocity: vec2f) -> f32 {
        return -atan2(velocity.x, velocity.y);
      }

      fn rotate_11(v: vec2f, angle: f32) -> vec2f {
        var cos = cos(angle);
        var sin = sin(angle);
        return vec2f(((v.x * cos) - (v.y * sin)), ((v.x * sin) + (v.y * cos)));
      }

      @group(0) @binding(0) var<uniform> colorPalette_12: vec3f;

      @vertex fn mainVert_7(input: mainVert_Input_8) -> mainVert_Output_9 {
        var angle = getRotationFromVelocity_10(input.velocity);
        var rotated = rotate_11(input.v, angle);
        var pos = vec4f((rotated.x + input.center.x), (rotated.y + input.center.y), 0, 1);
        var color = vec4f(((sin((angle + colorPalette_12.x)) * 0.45) + 0.45), ((sin((angle + colorPalette_12.y)) * 0.45) + 0.45), ((sin((angle + colorPalette_12.z)) * 0.45) + 0.45), 1);
        return mainVert_Output_9(pos, color);
      }

      struct mainFrag_Input_14 {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      @fragment fn mainFrag_13(input: mainFrag_Input_14) -> @location(0) vec4f {
        return input.color;
      }"
    `);
  });
});
