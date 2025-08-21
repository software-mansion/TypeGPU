/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('wgsl resolution example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    await runExampleTest({
      category: 'tests',
      name: 'wgsl-resolution',
    }, device);

    const wgslElement = document.querySelector('.wgsl') as HTMLDivElement;

    expect(wgslElement.innerText).toMatchInlineSnapshot(`
      "struct vertex_shader_Input_1 {
        @location(0) v: vec2f,
        @location(1) center: vec2f,
        @location(2) velocity: vec2f,
      }

      struct vertex_shader_Output_2 {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      fn get_rotation_from_velocity_util_3(velocity: vec2f) -> f32 {
        return -atan2(velocity.x, velocity.y);
      }

      fn rotate_util_4(v: vec2f, angle: f32) -> vec2f {
        var cos = cos(angle);
        var sin = sin(angle);
        return vec2f(((v.x * cos) - (v.y * sin)), ((v.x * sin) + (v.y * cos)));
      }

      @group(1) @binding(0) var<uniform> colorPalette_5: vec3f;

      @vertex fn vertex_shader_0(input: vertex_shader_Input_1) -> vertex_shader_Output_2 {
        var angle = get_rotation_from_velocity_util_3(input.velocity);
        var rotated = rotate_util_4(input.v, angle);
        var pos = vec4f((rotated.x + input.center.x), (rotated.y + input.center.y), 0, 1);
        var color = vec4f(((sin((angle + colorPalette_5.x)) * 0.45) + 0.45), ((sin((angle + colorPalette_5.y)) * 0.45) + 0.45), ((sin((angle + colorPalette_5.z)) * 0.45) + 0.45), 1);
        return vertex_shader_Output_2(pos, color);
      }

      struct fragment_shader_Input_7 {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      @fragment fn fragment_shader_6(input: fragment_shader_Input_7) -> @location(0) vec4f {
        return input.color;
      }

      struct compute_shader_Input_9 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      struct TriangleData_11 {
        position: vec2f,
        velocity: vec2f,
      }

      @group(2) @binding(0) var<storage, read> currentTrianglePos_10: array<TriangleData_11>;

      struct Params_13 {
        separationDistance: f32,
        separationStrength: f32,
        alignmentDistance: f32,
        alignmentStrength: f32,
        cohesionDistance: f32,
        cohesionStrength: f32,
      }

      @group(0) @binding(0) var<uniform> paramsBuffer_12: Params_13;

      @group(2) @binding(1) var<storage, read_write> nextTrianglePos_14: array<TriangleData_11>;

      @compute @workgroup_size(1) fn compute_shader_8(input: compute_shader_Input_9) {
        var index = input.gid.x;
        var instanceInfo = currentTrianglePos_10[index];
        var separation = vec2f();
        var alignment = vec2f();
        var cohesion = vec2f();
        var alignmentCount = 0;
        var cohesionCount = 0;
        for (var i = u32(0); (i < arrayLength(&currentTrianglePos_10)); i++) {
          if ((i == index)) {
            continue;
          }
          var other = currentTrianglePos_10[i];
          var dist = distance(instanceInfo.position, other.position);
          if ((dist < paramsBuffer_12.separationDistance)) {
            separation = (separation + (instanceInfo.position - other.position));
          }
          if ((dist < paramsBuffer_12.alignmentDistance)) {
            alignment = (alignment + other.velocity);
            alignmentCount++;
          }
          if ((dist < paramsBuffer_12.cohesionDistance)) {
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
        var velocity = (paramsBuffer_12.separationStrength * separation);
        velocity = (velocity + (paramsBuffer_12.alignmentStrength * alignment));
        velocity = (velocity + (paramsBuffer_12.cohesionStrength * cohesion));
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
        nextTrianglePos_14[index] = instanceInfo;
      }"
    `);
  });
});
