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
      "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      struct TriangleData_4 {
        position: vec2f,
        velocity: vec2f,
      }

      @group(1) @binding(0) var<storage, read> currentTrianglePos_3: array<TriangleData_4>;

      struct Params_6 {
        separationDistance: f32,
        separationStrength: f32,
        alignmentDistance: f32,
        alignmentStrength: f32,
        cohesionDistance: f32,
        cohesionStrength: f32,
      }

      @group(0) @binding(1) var<uniform> paramsBuffer_5: Params_6;

      @group(1) @binding(1) var<storage, read_write> nextTrianglePos_7: array<TriangleData_4>;

      fn simulate_2(index: u32, _arg_1: u32, _arg_2: u32) {
        var instanceInfo = currentTrianglePos_3[index];
        var separation = vec2f();
        var alignment = vec2f();
        var cohesion = vec2f();
        var alignmentCount = 0;
        var cohesionCount = 0;
        for (var i = 0u; (i < arrayLength(&currentTrianglePos_3)); i++) {
          if ((i == index)) {
            continue;
          }
          var other = currentTrianglePos_3[i];
          var dist = distance(instanceInfo.position, other.position);
          if ((dist < paramsBuffer_5.separationDistance)) {
            separation = (separation + (instanceInfo.position - other.position));
          }
          if ((dist < paramsBuffer_5.alignmentDistance)) {
            alignment = (alignment + other.velocity);
            alignmentCount++;
          }
          if ((dist < paramsBuffer_5.cohesionDistance)) {
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
        var velocity = (paramsBuffer_5.separationStrength * separation);
        velocity = (velocity + (paramsBuffer_5.alignmentStrength * alignment));
        velocity = (velocity + (paramsBuffer_5.cohesionStrength * cohesion));
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
        nextTrianglePos_7[index] = instanceInfo;
      }

      struct mainCompute_Input_8 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute_0(in: mainCompute_Input_8)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        simulate_2(in.id.x, in.id.y, in.id.z);
      }

      fn getRotationFromVelocity_1(velocity: vec2f) -> f32 {
        return -atan2(velocity.x, velocity.y);
      }

      fn rotate_2(v: vec2f, angle: f32) -> vec2f {
        var cos = cos(angle);
        var sin = sin(angle);
        return vec2f(((v.x * cos) - (v.y * sin)), ((v.x * sin) + (v.y * cos)));
      }

      @group(0) @binding(0) var<uniform> colorPalette_3: vec3f;

      struct mainVert_Output_4 {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      struct mainVert_Input_5 {
        @location(0) v: vec2f,
        @location(1) center: vec2f,
        @location(2) velocity: vec2f,
      }

      @vertex fn mainVert_0(input: mainVert_Input_5) -> mainVert_Output_4 {
        var angle = getRotationFromVelocity_1(input.velocity);
        var rotated = rotate_2(input.v, angle);
        var pos = vec4f((rotated + input.center), 0, 1);
        var color = vec4f(((sin((colorPalette_3 + angle)) * 0.45) + 0.45), 1);
        return mainVert_Output_4(pos, color);
      }

      struct mainFrag_Input_7 {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      @fragment fn mainFrag_6(input: mainFrag_Input_7) -> @location(0) vec4f {
        return input.color;
      }"
    `);
  });
});
