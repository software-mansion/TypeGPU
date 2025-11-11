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
      "fn get_rotation_from_velocity_util_1(velocity: vec2f) -> f32 {
        return -atan2(velocity.x, velocity.y);
      }

      fn rotate_util_2(v: vec2f, angle: f32) -> vec2f {
        var cos = cos(angle);
        var sin = sin(angle);
        return vec2f(((v.x * cos) - (v.y * sin)), ((v.x * sin) + (v.y * cos)));
      }

      @group(1) @binding(0) var<uniform> colorPalette_3: vec3f;

      struct vertex_shader_Output_4 {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      struct vertex_shader_Input_5 {
        @location(0) v: vec2f,
        @location(1) center: vec2f,
        @location(2) velocity: vec2f,
      }

      @vertex fn vertex_shader_0(input: vertex_shader_Input_5) -> vertex_shader_Output_4 {
        var angle = get_rotation_from_velocity_util_1(input.velocity);
        var rotated = rotate_util_2(input.v, angle);
        var pos = vec4f((rotated.x + input.center.x), (rotated.y + input.center.y), 0f, 1f);
        var color = vec4f(((sin((angle + colorPalette_3.x)) * 0.45f) + 0.45f), ((sin((angle + colorPalette_3.y)) * 0.45f) + 0.45f), ((sin((angle + colorPalette_3.z)) * 0.45f) + 0.45f), 1f);
        return vertex_shader_Output_4(pos, color);
      }

      struct fragment_shader_Input_7 {
        @builtin(position) position: vec4f,
        @location(0) color: vec4f,
      }

      @fragment fn fragment_shader_6(input: fragment_shader_Input_7) -> @location(0) vec4f {
        return input.color;
      }

      struct TriangleData_10 {
        position: vec2f,
        velocity: vec2f,
      }

      @group(2) @binding(0) var<storage, read> currentTrianglePos_9: array<TriangleData_10>;

      struct Params_12 {
        separationDistance: f32,
        separationStrength: f32,
        alignmentDistance: f32,
        alignmentStrength: f32,
        cohesionDistance: f32,
        cohesionStrength: f32,
      }

      @group(0) @binding(0) var<uniform> paramsBuffer_11: Params_12;

      @group(2) @binding(1) var<storage, read_write> nextTrianglePos_13: array<TriangleData_10>;

      struct compute_shader_Input_14 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn compute_shader_8(input: compute_shader_Input_14) {
        var index = input.gid.x;
        var instanceInfo = currentTrianglePos_9[index];
        var separation = vec2f();
        var alignment = vec2f();
        var cohesion = vec2f();
        var alignmentCount = 0;
        var cohesionCount = 0;
        for (var i = 0u; (i < arrayLength(&currentTrianglePos_9)); i++) {
          if ((i == index)) {
            continue;
          }
          var other = currentTrianglePos_9[i];
          var dist = distance(instanceInfo.position, other.position);
          if ((dist < paramsBuffer_11.separationDistance)) {
            separation = (separation + (instanceInfo.position - other.position));
          }
          if ((dist < paramsBuffer_11.alignmentDistance)) {
            alignment = (alignment + other.velocity);
            alignmentCount++;
          }
          if ((dist < paramsBuffer_11.cohesionDistance)) {
            cohesion = (cohesion + other.position);
            cohesionCount++;
          }
        }
        if ((alignmentCount > 0i)) {
          alignment = ((1f / f32(alignmentCount)) * alignment);
        }
        if ((cohesionCount > 0i)) {
          cohesion = ((1f / f32(cohesionCount)) * cohesion);
          cohesion = (cohesion - instanceInfo.position);
        }
        var velocity = (paramsBuffer_11.separationStrength * separation);
        velocity = (velocity + (paramsBuffer_11.alignmentStrength * alignment));
        velocity = (velocity + (paramsBuffer_11.cohesionStrength * cohesion));
        instanceInfo.velocity = (instanceInfo.velocity + velocity);
        instanceInfo.velocity = (clamp(length(instanceInfo.velocity), 0f, 0.01f) * normalize(instanceInfo.velocity));
        if ((instanceInfo.position.x > 1.03f)) {
          instanceInfo.position.x = (-1 - 0.03);
        }
        if ((instanceInfo.position.y > 1.03f)) {
          instanceInfo.position.y = (-1 - 0.03);
        }
        if ((instanceInfo.position.x < (-1 - 0.03))) {
          instanceInfo.position.x = 1.03f;
        }
        if ((instanceInfo.position.y < (-1 - 0.03))) {
          instanceInfo.position.y = 1.03f;
        }
        instanceInfo.position = (instanceInfo.position + instanceInfo.velocity);
        nextTrianglePos_13[index] = instanceInfo;
      }"
    `);
  });
});
