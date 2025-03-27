import { describe, expect, it } from 'vitest';
import { vec2f, vec4f } from '../../src/data';
import {
  pack2x16float,
  pack4x8unorm,
  unpack2x16float,
  unpack4x8unorm,
} from '../../src/std';

describe('packing', () => {
  it('packs and unpacks 4x8 unorm', () => {
    const packed = pack4x8unorm(vec4f(0.5, 0.25, 0.75, 1));
    const unpacked = unpack4x8unorm(packed);
    expect(unpacked.x).toBeCloseTo(0.5);
    expect(unpacked.y).toBeCloseTo(0.25);
    expect(unpacked.z).toBeCloseTo(0.75);
    expect(unpacked.w).toBeCloseTo(1);
  });

  it('packs and unpacks 2x16 float', () => {
    const packed = pack2x16float(vec2f(0.5, 0.25));
    const unpacked = unpack2x16float(packed);
    expect(unpacked.x).toBeCloseTo(0.5);
    expect(unpacked.y).toBeCloseTo(0.25);
  });
});
