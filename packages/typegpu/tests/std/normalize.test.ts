import { describe, expect, it } from 'vitest';
import {
  vec2f,
  vec2i,
  vec2u,
  vec3f,
  vec3i,
  vec3u,
  vec4f,
  vec4i,
  vec4u,
} from '../../src/data';
import { std } from '../../src/std';

describe('normalize', () => {
  it('computes normalized vector from vec2f', () => {
    expect(std.normalize(vec2f(1, 1)).x).toBeCloseTo(Math.sqrt(2) / 2);
    expect(std.normalize(vec2f(3, 4))).toEqual(vec2f(0.6, 0.8));
  });

  it('computes normalized vector from vec2u', () => {
    expect(std.normalize(vec2u(1, 0))).toEqual(vec2u(1, 0));
    expect(std.normalize(vec2u(0, 3))).toEqual(vec2u(0, 1));
  });

  it('computes normalized vector from vec2i', () => {
    expect(std.normalize(vec2i(1, 0))).toEqual(vec2i(1, 0));
    expect(std.normalize(vec2i(0, -3))).toEqual(vec2i(0, -1));
  });

  it('computes normalized vector from vec3f', () => {
    expect(std.normalize(vec3f(1, 1, 0)).y).toBeCloseTo(Math.sqrt(2) / 2);
    expect(std.normalize(vec3f(0, 3, 4))).toEqual(vec3f(0, 0.6, 0.8));
  });

  it('computes normalized vector from vec3u', () => {
    expect(std.normalize(vec3u(1, 0, 0))).toEqual(vec3u(1, 0, 0));
    expect(std.normalize(vec3u(0, 3, 0))).toEqual(vec3u(0, 1, 0));
  });

  it('computes normalized vector from vec3i', () => {
    expect(std.normalize(vec3i(1, 0, 0))).toEqual(vec3i(1, 0, 0));
    expect(std.normalize(vec3i(0, -3, 0))).toEqual(vec3i(0, -1, 0));
  });

  it('computes normalized vector from vec4f', () => {
    expect(std.normalize(vec4f(1, 0, 1, 0)).z).toBeCloseTo(Math.sqrt(2) / 2);
    expect(std.normalize(vec4f(0, 3, 0, 4))).toEqual(vec4f(0, 0.6, 0, 0.8));
  });

  it('computes normalized vector from vec4u', () => {
    expect(std.normalize(vec4u(1, 0, 0, 0))).toEqual(vec4u(1, 0, 0, 0));
    expect(std.normalize(vec4u(0, 3, 0, 0))).toEqual(vec4u(0, 1, 0, 0));
  });

  it('computes normalized vector from vec4i', () => {
    expect(std.normalize(vec4i(1, 0, 0, 0))).toEqual(vec4i(1, 0, 0, 0));
    expect(std.normalize(vec4i(0, -3, 0, 0))).toEqual(vec4i(0, -1, 0, 0));
  });
});
