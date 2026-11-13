/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import {
  mockCreateImageBitmap,
  mockFonts,
  mockImageLoading,
  mockResizeObserver,
} from './utils/commonMocks.ts';

describe('deferred-rendering example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'deferred-rendering',
        setupMocks: () => {
          mockFonts();
          mockImageLoading();
          mockResizeObserver();
          mockCreateImageBitmap({ width: 512, height: 256 });
        },
        expectedCalls: 2,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "const QUAD: array<vec2u, 6> = array<vec2u, 6>(vec2u(), vec2u(1, 0), vec2u(1), vec2u(), vec2u(1), vec2u(0, 1));

      fn indexAt_1(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 1u) + corner.x);
        let row = ((cell / 1u) + corner.y);
        return ((row * 2u) + col);
      }

      fn indexAt_2(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 48u) + corner.x);
        let row = ((cell / 48u) + corner.y);
        return ((row * 49u) + col);
      }

      fn indexAt_4(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 1u) + corner.x);
        let row = ((cell / 1u) + corner.y);
        return ((row * 2u) + col);
      }

      fn indexAt_5(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 1u) + corner.x);
        let row = ((cell / 1u) + corner.y);
        return ((row * 2u) + col);
      }

      fn indexAt_6(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 1u) + corner.x);
        let row = ((cell / 1u) + corner.y);
        return ((row * 2u) + col);
      }

      fn indexAt_3(i: u32) -> u32 {
        var local = i;
        // unrolled iteration #2 / #0
        if ((local < 6u)) {
          return (indexAt_4(local) + 0u);
        }
        local -= 6u;
        // unrolled iteration #2 / #1
        if ((local < 6u)) {
          return (indexAt_4(local) + 4u);
        }
        local -= 6u;
        // unrolled iteration #2 / #2
        if ((local < 6u)) {
          return (indexAt_5(local) + 8u);
        }
        local -= 6u;
        // unrolled iteration #2 / #3
        if ((local < 6u)) {
          return (indexAt_5(local) + 12u);
        }
        local -= 6u;
        // unrolled iteration #2 / #4
        if ((local < 6u)) {
          return (indexAt_6(local) + 16u);
        }
        local -= 6u;
        // unrolled iteration #2 / #5
        if ((local < 6u)) {
          return (indexAt_6(local) + 20u);
        }
        local -= 6u;
        // ---
        return 0u;
      }

      fn indexAt_8(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 100u) + corner.x);
        let row = ((cell / 100u) + corner.y);
        return ((row * 101u) + col);
      }

      fn indexAt_9(i: u32) -> u32 {
        let triangle = (i / 3u);
        if (((i % 3u) == 0u)) {
          return 0;
        }
        if (((i % 3u) == 1u)) {
          return (((triangle + 1u) % 100u) + 1u);
        }
        return (triangle + 1u);
      }

      fn indexAt_7(i: u32) -> u32 {
        var local = i;
        // unrolled iteration #3 / #0
        if ((local < 600u)) {
          return (indexAt_8(local) + 0u);
        }
        local -= 600u;
        // unrolled iteration #3 / #1
        if ((local < 300u)) {
          return (indexAt_9(local) + 202u);
        }
        local -= 300u;
        // unrolled iteration #3 / #2
        if ((local < 300u)) {
          return (indexAt_9(local) + 303u);
        }
        local -= 300u;
        // ---
        return 0u;
      }

      fn indexAt_10(i: u32) -> u32 {
        let cell = (i / 6u);
        let corner = QUAD[(i % 6u)];
        let col = ((cell % 100u) + corner.x);
        let row = ((cell / 100u) + corner.y);
        return ((row * 101u) + col);
      }

      fn indexAt(i: u32) -> u32 {
        var local = i;
        // unrolled iteration #0
        if ((local < 6u)) {
          return (indexAt_1(local) + 0u);
        }
        local -= 6u;
        // unrolled iteration #1
        if ((local < 6912u)) {
          return (indexAt_2(local) + 4u);
        }
        local -= 6912u;
        // unrolled iteration #2
        if ((local < 36u)) {
          return (indexAt_3(local) + 1229u);
        }
        local -= 36u;
        // unrolled iteration #3
        if ((local < 1200u)) {
          return (indexAt_7(local) + 1253u);
        }
        local -= 1200u;
        // unrolled iteration #4
        if ((local < 60000u)) {
          return (indexAt_10(local) + 1657u);
        }
        local -= 60000u;
        // ---
        return 0u;
      }

      fn plane(u: f32, v: f32) -> vec3f {
        return vec3f((u - 0.5f), 0f, (0.5f - v));
      }

      fn at(u: f32, v: f32) -> vec3f {
        return (plane(u, v) * vec3f(40, 1, 40));
      }

      fn normalAt(_arg_0: f32, _arg_1: f32) -> vec3f {
        return vec3f(0, 1, 0);
      }

      struct Surface {
        position: vec3f,
        normal: vec3f,
        uv: vec2f,
      }

      fn item(u: f32, v: f32) -> Surface {
        return Surface(at(u, v), normalAt(u, v), vec2f(u, v));
      }

      fn vertexAt_3(i: u32) -> Surface {
        let col = (i % 2u);
        let row = (i / 2u);
        let u = (f32(col) / 1f);
        let v = (f32(row) / 1f);
        return item(u, v);
      }

      struct Color {
        color: vec3f,
      }

      fn item_1(_arg_0: Surface) -> Color {
        return Color(vec3f(0.30000001192092896));
      }

      struct Vertex {
        position: vec3f,
        normal: vec3f,
        uv: vec2f,
        color: vec3f,
      }

      fn vertexAt_2(i: u32) -> Vertex {
        let s = vertexAt_3(i);
        let e = item_1(s);
        var out = Vertex();
        // unrolled iteration #0 / #0
        out.position = s.position;
        // unrolled iteration #0 / #1
        out.normal = s.normal;
        // unrolled iteration #0 / #2
        out.uv = s.uv;
        // ---
        // unrolled iteration #0 / #0
        out.color = e.color;
        // ---
        return out;
      }

      fn torus(u: f32, v: f32, radius: f32, tube: f32) -> vec3f {
        let phi = (u * 6.283185307179586f);
        let t = (v * 6.283185307179586f);
        let ring = (radius + (tube * cos(t)));
        return vec3f((ring * cos(phi)), (-(tube) * sin(t)), (ring * sin(phi)));
      }

      fn item_2(u: f32, v: f32) -> Surface {
        return Surface(torus(u, v, 3f, 0.5f), torus(u, v, 0f, 1f), vec2f(u, v));
      }

      fn vertexAt_6(i: u32) -> Surface {
        let col = (i % 49u);
        let row = (i / 49u);
        let u = (f32(col) / 48f);
        let v = (f32(row) / 24f);
        return item_2(u, v);
      }

      fn vertexAt_5(i: u32) -> Surface {
        var s = vertexAt_6(i);
        s.position = (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 3, 7, 1) * vec4f(s.position, 1f)).xyz;
        let normal = (mat3x3f(1, 0, 0, 0, 1, 0, 0, 0, 1) * s.normal);
        if ((dot(normal, normal) > 0f)) {
          s.normal = normalize(normal);
        }
        else {
          s.normal = vec3f();
        }
        return s;
      }

      fn item_3(_arg_0: Surface) -> Color {
        return Color(vec3f(1, 0.20000000298023224, 0.20000000298023224));
      }

      fn vertexAt_4(i: u32) -> Vertex {
        let s = vertexAt_5(i);
        let e = item_3(s);
        var out = Vertex();
        // unrolled iteration #1 / #0
        out.position = s.position;
        // unrolled iteration #1 / #1
        out.normal = s.normal;
        // unrolled iteration #1 / #2
        out.uv = s.uv;
        // ---
        // unrolled iteration #1 / #0
        out.color = e.color;
        // ---
        return out;
      }

      fn at_1(u: f32, v: f32) -> vec3f {
        return (plane(u, v) * vec3f(3, 1, 4));
      }

      fn normalAt_1(_arg_0: f32, _arg_1: f32) -> vec3f {
        return vec3f(0, 1, 0);
      }

      fn item_4(u: f32, v: f32) -> Surface {
        return Surface(at_1(u, v), normalAt_1(u, v), vec2f(u, v));
      }

      fn vertexAt_12(i: u32) -> Surface {
        let col = (i % 2u);
        let row = (i / 2u);
        let u = (f32(col) / 1f);
        let v = (f32(row) / 1f);
        return item_4(u, v);
      }

      fn vertexAt_11(i: u32) -> Surface {
        var s = vertexAt_12(i);
        s.position = (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2.5, 0, 1) * vec4f(s.position, 1f)).xyz;
        let normal = (mat3x3f(1, 0, 0, 0, 1, 0, 0, 0, 1) * s.normal);
        if ((dot(normal, normal) > 0f)) {
          s.normal = normalize(normal);
        }
        else {
          s.normal = vec3f();
        }
        return s;
      }

      fn vertexAt_13(i: u32) -> Surface {
        var s = vertexAt_12(i);
        s.position = (mat4x4f(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, -2.5, 0, 1) * vec4f(s.position, 1f)).xyz;
        let normal = (mat3x3f(1, 0, 0, 0, -1, 0, 0, 0, -1) * s.normal);
        if ((dot(normal, normal) > 0f)) {
          s.normal = normalize(normal);
        }
        else {
          s.normal = vec3f();
        }
        return s;
      }

      fn at_2(u: f32, v: f32) -> vec3f {
        return (plane(u, v) * vec3f(3, 1, 5));
      }

      fn normalAt_2(_arg_0: f32, _arg_1: f32) -> vec3f {
        return vec3f(0, 1, 0);
      }

      fn item_5(u: f32, v: f32) -> Surface {
        return Surface(at_2(u, v), normalAt_2(u, v), vec2f(u, v));
      }

      fn vertexAt_15(i: u32) -> Surface {
        let col = (i % 2u);
        let row = (i / 2u);
        let u = (f32(col) / 1f);
        let v = (f32(row) / 1f);
        return item_5(u, v);
      }

      fn vertexAt_14(i: u32) -> Surface {
        var s = vertexAt_15(i);
        s.position = (mat4x4f(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 2, 1) * vec4f(s.position, 1f)).xyz;
        let normal = (mat3x3f(1, 0, 0, 0, 0, 1, 0, -1, 0) * s.normal);
        if ((dot(normal, normal) > 0f)) {
          s.normal = normalize(normal);
        }
        else {
          s.normal = vec3f();
        }
        return s;
      }

      fn vertexAt_16(i: u32) -> Surface {
        var s = vertexAt_15(i);
        s.position = (mat4x4f(-1, 0, 0, 0, 0, 0, -1, 0, 0, -1, 0, 0, 0, 0, -2, 1) * vec4f(s.position, 1f)).xyz;
        let normal = (mat3x3f(-1, 0, 0, 0, 0, -1, 0, -1, 0) * s.normal);
        if ((dot(normal, normal) > 0f)) {
          s.normal = normalize(normal);
        }
        else {
          s.normal = vec3f();
        }
        return s;
      }

      fn at_3(u: f32, v: f32) -> vec3f {
        return (plane(u, v) * vec3f(4, 1, 5));
      }

      fn normalAt_3(_arg_0: f32, _arg_1: f32) -> vec3f {
        return vec3f(0, 1, 0);
      }

      fn item_6(u: f32, v: f32) -> Surface {
        return Surface(at_3(u, v), normalAt_3(u, v), vec2f(u, v));
      }

      fn vertexAt_18(i: u32) -> Surface {
        let col = (i % 2u);
        let row = (i / 2u);
        let u = (f32(col) / 1f);
        let v = (f32(row) / 1f);
        return item_6(u, v);
      }

      fn vertexAt_17(i: u32) -> Surface {
        var s = vertexAt_18(i);
        s.position = (mat4x4f(0, 0, -1, 0, 1, 0, 0, 0, 0, -1, 0, 0, 1.5, 0, 0, 1) * vec4f(s.position, 1f)).xyz;
        let normal = (mat3x3f(0, 0, -1, 1, 0, 0, 0, -1, 0) * s.normal);
        if ((dot(normal, normal) > 0f)) {
          s.normal = normalize(normal);
        }
        else {
          s.normal = vec3f();
        }
        return s;
      }

      fn vertexAt_19(i: u32) -> Surface {
        var s = vertexAt_18(i);
        s.position = (mat4x4f(0, 0, 1, 0, -1, 0, 0, 0, 0, -1, 0, 0, -1.5, 0, 0, 1) * vec4f(s.position, 1f)).xyz;
        let normal = (mat3x3f(0, 0, 1, -1, 0, 0, 0, -1, 0) * s.normal);
        if ((dot(normal, normal) > 0f)) {
          s.normal = normalize(normal);
        }
        else {
          s.normal = vec3f();
        }
        return s;
      }

      fn vertexAt_10(i: u32) -> Surface {
        var local = i;
        // unrolled iteration #2 / #0
        if ((local < 4u)) {
          return vertexAt_11(local);
        }
        local -= 4u;
        // unrolled iteration #2 / #1
        if ((local < 4u)) {
          return vertexAt_13(local);
        }
        local -= 4u;
        // unrolled iteration #2 / #2
        if ((local < 4u)) {
          return vertexAt_14(local);
        }
        local -= 4u;
        // unrolled iteration #2 / #3
        if ((local < 4u)) {
          return vertexAt_16(local);
        }
        local -= 4u;
        // unrolled iteration #2 / #4
        if ((local < 4u)) {
          return vertexAt_17(local);
        }
        local -= 4u;
        // unrolled iteration #2 / #5
        if ((local < 4u)) {
          return vertexAt_19(local);
        }
        local -= 4u;
        // ---
        return Surface();
      }

      @group(0) @binding(0) var<uniform> timeUniform: u32;

      fn item_7(vertex: Surface) -> Surface {
        var vertexCopy = vertex;
        let time = (f32(timeUniform) / 1000f);
        let transformation = mat4x4f(cos(time), 0, -sin(time), 0, 0, 1, 0, 0, sin(time), 0, cos(time), 0, 0, 0, 0, 1);
        vertexCopy.position = (vec4f(vertexCopy.position, 1f) * transformation).xyz;
        vertexCopy.normal = (vec4f(vertexCopy.normal, 0f) * transformation).xyz;
        return vertexCopy;
      }

      fn vertexAt_9(i: u32) -> Surface {
        return item_7(vertexAt_10(i));
      }

      fn vertexAt_8(i: u32) -> Surface {
        var s = vertexAt_9(i);
        s.position = (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -7, 3, 7, 1) * vec4f(s.position, 1f)).xyz;
        let normal = (mat3x3f(1, 0, 0, 0, 1, 0, 0, 0, 1) * s.normal);
        if ((dot(normal, normal) > 0f)) {
          s.normal = normalize(normal);
        }
        else {
          s.normal = vec3f();
        }
        return s;
      }

      fn item_8(_arg_0: Surface) -> Color {
        return Color(vec3f(0.20000000298023224, 0.5, 0.8999999761581421));
      }

      fn vertexAt_7(i: u32) -> Vertex {
        let s = vertexAt_8(i);
        let e = item_8(s);
        var out = Vertex();
        // unrolled iteration #2 / #0
        out.position = s.position;
        // unrolled iteration #2 / #1
        out.normal = s.normal;
        // unrolled iteration #2 / #2
        out.uv = s.uv;
        // ---
        // unrolled iteration #2 / #0
        out.color = e.color;
        // ---
        return out;
      }

      fn cylinder(u: f32, v: f32) -> vec3f {
        let phi = (u * 6.283185307179586f);
        return vec3f(cos(phi), (0.5f - v), sin(phi));
      }

      fn item_9(u: f32, v: f32) -> Surface {
        let p = cylinder(u, v);
        return Surface((p * vec3f(3, 8, 3)), vec3f(p.x, 0f, p.z), vec2f(u, v));
      }

      fn vertexAt_25(i: u32) -> Surface {
        let col = (i % 101u);
        let row = (i / 101u);
        let u = (f32(col) / 100f);
        let v = (f32(row) / 1f);
        return item_9(u, v);
      }

      fn disc(u: f32, v: f32) -> vec3f {
        let phi = (u * 6.283185307179586f);
        return vec3f((v * cos(phi)), 0f, (v * sin(phi)));
      }

      fn vertexAt_27(i: u32) -> Surface {
        var direction = vec3f();
        if ((i > 0u)) {
          direction = disc((f32((i - 1u)) / 100f), 1f);
        }
        return Surface((direction * 3f), vec3f(0, 1, 0), ((direction.xz * 0.5f) + 0.5f));
      }

      fn vertexAt_26(i: u32) -> Surface {
        var s = vertexAt_27(i);
        s.position = (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 4, 0, 1) * vec4f(s.position, 1f)).xyz;
        let normal = (mat3x3f(1, 0, 0, 0, 1, 0, 0, 0, 1) * s.normal);
        if ((dot(normal, normal) > 0f)) {
          s.normal = normalize(normal);
        }
        else {
          s.normal = vec3f();
        }
        return s;
      }

      fn vertexAt_28(i: u32) -> Surface {
        var s = vertexAt_27(i);
        s.position = (mat4x4f(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, -4, 0, 1) * vec4f(s.position, 1f)).xyz;
        let normal = (mat3x3f(1, 0, 0, 0, -1, 0, 0, 0, -1) * s.normal);
        if ((dot(normal, normal) > 0f)) {
          s.normal = normalize(normal);
        }
        else {
          s.normal = vec3f();
        }
        return s;
      }

      fn vertexAt_24(i: u32) -> Surface {
        var local = i;
        // unrolled iteration #3 / #0
        if ((local < 202u)) {
          return vertexAt_25(local);
        }
        local -= 202u;
        // unrolled iteration #3 / #1
        if ((local < 101u)) {
          return vertexAt_26(local);
        }
        local -= 101u;
        // unrolled iteration #3 / #2
        if ((local < 101u)) {
          return vertexAt_28(local);
        }
        local -= 101u;
        // ---
        return Surface();
      }

      fn item_10(vertex: Surface) -> Surface {
        var vertexCopy = vertex;
        let p = (&vertexCopy.position);
        let factor = ((4f - (*p).y) / 8f);
        vertexCopy.position = vec3f(((*p).x * factor), (*p).y, ((*p).z * factor));
        if ((vertex.normal.y == 0f)) {
          let newNormal = (&vertexCopy.normal);
          (*newNormal).y += 0.375f;
          vertexCopy.normal = normalize((*newNormal));
        }
        return vertexCopy;
      }

      fn vertexAt_23(i: u32) -> Surface {
        return item_10(vertexAt_24(i));
      }

      fn item_11(vertex: Surface) -> Surface {
        var vertexCopy = vertex;
        let time = (f32(timeUniform) / 1000f);
        vertexCopy.position.y += sin(time);
        return vertexCopy;
      }

      fn vertexAt_22(i: u32) -> Surface {
        return item_11(vertexAt_23(i));
      }

      fn vertexAt_21(i: u32) -> Surface {
        var s = vertexAt_22(i);
        s.position = (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -7, 6, -7, 1) * vec4f(s.position, 1f)).xyz;
        let normal = (mat3x3f(1, 0, 0, 0, 1, 0, 0, 0, 1) * s.normal);
        if ((dot(normal, normal) > 0f)) {
          s.normal = normalize(normal);
        }
        else {
          s.normal = vec3f();
        }
        return s;
      }

      fn item_12(_arg_0: Surface) -> Color {
        return Color(vec3f(0.30000001192092896, 0.699999988079071, 0.30000001192092896));
      }

      fn vertexAt_20(i: u32) -> Vertex {
        let s = vertexAt_21(i);
        let e = item_12(s);
        var out = Vertex();
        // unrolled iteration #3 / #0
        out.position = s.position;
        // unrolled iteration #3 / #1
        out.normal = s.normal;
        // unrolled iteration #3 / #2
        out.uv = s.uv;
        // ---
        // unrolled iteration #3 / #0
        out.color = e.color;
        // ---
        return out;
      }

      fn sphere(u: f32, v: f32) -> vec3f {
        let theta = (v * 3.141592653589793f);
        let phi = (u * 6.283185307179586f);
        let sinTheta = sin(theta);
        return vec3f((sinTheta * cos(phi)), cos(theta), (sinTheta * sin(phi)));
      }

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed3(value: vec3f) -> vec3u {
        let u32Value = bitcast<vec3u>(value);
        return vec3u(hash((u32Value.x ^ 1253408251u)), hash((u32Value.y ^ 2900286023u)), hash((u32Value.z ^ 3164612939u)));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed3(value: vec3f) {
        let scrambled = scrambleSeed3(value);
        let newSeed = vec2u(hash((scrambled.x ^ rotl(scrambled.z, 16u))), hash((rotl(scrambled.y, 16u) ^ scrambled.z)));
        gpuSeed = newSeed;
      }

      fn randSeed3(seed: vec3f) {
        seed3(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed.x;
          var s1 = gpuSeed.y;
          s1 ^= s0;
          gpuSeed.x = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed.y = rotl(s1, 13u);
          return (rotl((gpuSeed.x * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample_1() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randOnUnitSphere() -> vec3f {
        let z = ((2f * sample_1()) - 1f);
        let oneMinusZSq = sqrt((1f - (z * z)));
        let theta = (6.283185307179586f * sample_1());
        let x = (cos(theta) * oneMinusZSq);
        let y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn computeJunctionGradient(pos: vec3i) -> vec3f {
        randSeed3((1e-3f * vec3f(pos)));
        return randOnUnitSphere();
      }

      fn dotProdGrid(pos: vec3f, junction: vec3f) -> f32 {
        let relative = (pos - junction);
        let gridVector = computeJunctionGradient(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolation(t: vec3f) -> vec3f {
        return (((t * t) * t) * ((t * ((t * 6f) - 15f)) + 10f));
      }

      fn sample(pos: vec3f) -> f32 {
        let minJunction = floor(pos);
        let xyz = dotProdGrid(pos, minJunction);
        let xyZ = dotProdGrid(pos, (minJunction + vec3f(0, 0, 1)));
        let xYz = dotProdGrid(pos, (minJunction + vec3f(0, 1, 0)));
        let xYZ = dotProdGrid(pos, (minJunction + vec3f(0, 1, 1)));
        let Xyz = dotProdGrid(pos, (minJunction + vec3f(1, 0, 0)));
        let XyZ = dotProdGrid(pos, (minJunction + vec3f(1, 0, 1)));
        let XYz = dotProdGrid(pos, (minJunction + vec3f(1, 1, 0)));
        let XYZ = dotProdGrid(pos, (minJunction + vec3f(1)));
        let partial = (pos - minJunction);
        let smoothPartial = quinticInterpolation(partial);
        let xy = mix(xyz, xyZ, smoothPartial.z);
        let xY = mix(xYz, xYZ, smoothPartial.z);
        let Xy = mix(Xyz, XyZ, smoothPartial.z);
        let XY = mix(XYz, XYZ, smoothPartial.z);
        let x = mix(xy, xY, smoothPartial.y);
        let X = mix(Xy, XY, smoothPartial.y);
        return mix(x, X, smoothPartial.x);
      }

      fn at_4(u: f32, v: f32) -> vec3f {
        let p = (sphere(u, v) * 3f);
        return (p * (1f + (sample(p) / 10f)));
      }

      fn item_14(u: f32, v: f32) -> vec3f {
        let vv = clamp(v, 2e-3f, 0.998f);
        let du = (at_4(min((u + 1e-3f), 1f), vv) - at_4(max((u - 1e-3f), 0f), vv));
        let dv = (at_4(u, (vv + 1e-3f)) - at_4(u, (vv - 1e-3f)));
        let normal = cross(du, dv);
        if ((dot(normal, normal) > 0f)) {
          return normalize(normal);
        }
        return vec3f();
      }

      fn item_13(u: f32, v: f32) -> Surface {
        return Surface(at_4(u, v), item_14(u, v), vec2f(u, v));
      }

      fn vertexAt_33(i: u32) -> Surface {
        let col = (i % 101u);
        let row = (i / 101u);
        let u = (f32(col) / 100f);
        let v = (f32(row) / 100f);
        return item_13(u, v);
      }

      fn item_15(vertex: Surface) -> Surface {
        var vertexCopy = vertex;
        let time = (f32(timeUniform) / 1000f);
        vertexCopy.position.y += sin(time);
        return vertexCopy;
      }

      fn vertexAt_32(i: u32) -> Surface {
        return item_15(vertexAt_33(i));
      }

      fn item_16(vertex: Surface) -> Surface {
        var vertexCopy = vertex;
        let time = (f32(timeUniform) / 1000f);
        let transformation = mat4x4f(cos(time), 0, -sin(time), 0, 0, 1, 0, 0, sin(time), 0, cos(time), 0, 0, 0, 0, 1);
        vertexCopy.position = (vec4f(vertexCopy.position, 1f) * transformation).xyz;
        vertexCopy.normal = (vec4f(vertexCopy.normal, 0f) * transformation).xyz;
        return vertexCopy;
      }

      fn vertexAt_31(i: u32) -> Surface {
        return item_16(vertexAt_32(i));
      }

      fn vertexAt_30(i: u32) -> Surface {
        var s = vertexAt_31(i);
        s.position = (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 5, -7, 1) * vec4f(s.position, 1f)).xyz;
        let normal = (mat3x3f(1, 0, 0, 0, 1, 0, 0, 0, 1) * s.normal);
        if ((dot(normal, normal) > 0f)) {
          s.normal = normalize(normal);
        }
        else {
          s.normal = vec3f();
        }
        return s;
      }

      fn item_17(_arg_0: Surface) -> Color {
        return Color(vec3f(0.5));
      }

      fn vertexAt_29(i: u32) -> Vertex {
        let s = vertexAt_30(i);
        let e = item_17(s);
        var out = Vertex();
        // unrolled iteration #4 / #0
        out.position = s.position;
        // unrolled iteration #4 / #1
        out.normal = s.normal;
        // unrolled iteration #4 / #2
        out.uv = s.uv;
        // ---
        // unrolled iteration #4 / #0
        out.color = e.color;
        // ---
        return out;
      }

      fn vertexAt_1(i: u32) -> Vertex {
        var local = i;
        // unrolled iteration #0
        if ((local < 4u)) {
          return vertexAt_2(local);
        }
        local -= 4u;
        // unrolled iteration #1
        if ((local < 1225u)) {
          return vertexAt_4(local);
        }
        local -= 1225u;
        // unrolled iteration #2
        if ((local < 24u)) {
          return vertexAt_7(local);
        }
        local -= 24u;
        // unrolled iteration #3
        if ((local < 404u)) {
          return vertexAt_20(local);
        }
        local -= 404u;
        // unrolled iteration #4
        if ((local < 10201u)) {
          return vertexAt_29(local);
        }
        local -= 10201u;
        // ---
        return Vertex();
      }

      fn vertexAt(i: u32) -> Vertex {
        return vertexAt_1(indexAt(i));
      }

      struct Camera {
        pos: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
        viewInverse: mat4x4f,
        projectionInverse: mat4x4f,
      }

      @group(0) @binding(1) var<uniform> cameraUniform: Camera;

      struct geometryVertexFn_Output {
        @builtin(position) pos: vec4f,
        @location(0) scenePosition: vec3f,
        @location(1) albedo: vec3f,
        @location(2) normal: vec3f,
      }

      @vertex fn geometryVertexFn(@builtin(vertex_index) vId: u32) -> geometryVertexFn_Output {
        let info = vertexAt(vId);
        let pos = ((cameraUniform.projection * cameraUniform.view) * vec4f(info.position, 1f));
        return geometryVertexFn_Output(pos, info.position, info.color, info.normal);
      }

      struct geometryFragmentFn_Output {
        @location(0) position: vec4f,
        @location(1) normal: vec4f,
        @location(2) albedo: vec4f,
      }

      struct geometryFragmentFn_Input {
        @location(0) scenePosition: vec3f,
        @location(1) albedo: vec3f,
        @location(2) normal: vec3f,
      }

      @fragment fn geometryFragmentFn(_arg_0: geometryFragmentFn_Input) -> geometryFragmentFn_Output {
        return geometryFragmentFn_Output(vec4f(_arg_0.scenePosition, 0f), vec4f(_arg_0.normal, 0f), vec4f(_arg_0.albedo, 0f));
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(@builtin(vertex_index) vertexIndex: u32) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[vertexIndex], 0, 1), uv[vertexIndex]);
      }

      @group(1) @binding(2) var albedo: texture_2d<f32>;

      @group(1) @binding(0) var position_1: texture_2d<f32>;

      @group(1) @binding(1) var normal: texture_2d<f32>;

      struct Camera {
        pos: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
        viewInverse: mat4x4f,
        projectionInverse: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform: Camera;

      fn phong(albedo_1: vec3f, position: vec3f, normal_1: vec3f) -> vec4f {
        let lightColor = vec3f(1, 0.8999999761581421, 0.699999988079071);
        let lightDirection = vec3f(0.5773502588272095);
        let ambient = (albedo_1 * 0.5f);
        let cosTheta = dot(normal_1, lightDirection);
        let diffuse = ((albedo_1 * lightColor) * max(0f, cosTheta));
        let reflectionDirection = reflect((-1f * lightDirection), normal_1);
        let viewDirection = normalize((cameraUniform.pos.xyz - position));
        let specular = ((lightColor * pow(max(0f, dot(reflectionDirection, viewDirection)), 64f)) * 0.2f);
        let color = ((ambient + diffuse) + specular);
        return vec4f(color, 1f);
      }

      @fragment fn lightingFragmentFn(@builtin(position) position: vec4f) -> @location(0) vec4f {
        let pixel = vec2i(position.xy);
        let albedo_1 = textureLoad(albedo, pixel, 0).xyz;
        let scenePosition = textureLoad(position_1, pixel, 0).xyz;
        let normal_1 = textureLoad(normal, pixel, 0).xyz;
        if (all((normal_1 == vec3f()))) {
          return vec4f(0.5, 0.5, 0.800000011920929, 1);
        }
        return phong(albedo_1, scenePosition, normalize(normal_1));
      }"
    `);
  });
});
