import { describe, expect, it } from 'vitest';
import { d, tgpu } from 'typegpu';
import { sdCappedTorus, sdgHexagon2d, sdHexagon2d, sdTorus } from '../src/index.ts';

const SQRT3 = Math.sqrt(3);

describe('sdTorus', () => {
  const radii = d.vec2f(1, 0.25);

  it('is zero on the surface, negative inside the tube and positive outside', () => {
    expect(sdTorus(d.vec3f(1.25, 0, 0), radii)).toBeCloseTo(0);
    expect(sdTorus(d.vec3f(0, 0.25, -1), radii)).toBeCloseTo(0);
    expect(sdTorus(d.vec3f(1, 0, 0), radii)).toBeCloseTo(-0.25);
    expect(sdTorus(d.vec3f(0, 0, 0), radii)).toBeCloseTo(0.75);
    expect(sdTorus(d.vec3f(0, 0, 2), radii)).toBeCloseTo(0.75);
  });

  it('resolves to WGSL', () => {
    expect(tgpu.resolve([sdTorus])).toContain('fn sdTorus');
  });
});

describe('sdCappedTorus', () => {
  // a half torus: the arc spans 90 degrees to each side of (0, majorRadius)
  const sc = d.vec2f(1, 0);

  it('matches a full torus section inside the arc', () => {
    expect(sdCappedTorus(d.vec3f(0, 1.25, 0), sc, 1, 0.25)).toBeCloseTo(0);
    expect(sdCappedTorus(d.vec3f(0, 1, 0), sc, 1, 0.25)).toBeCloseTo(-0.25);
    expect(sdCappedTorus(d.vec3f(1, 0, 0.25), sc, 1, 0.25)).toBeCloseTo(0);
  });

  it('measures from the cap end when outside the arc', () => {
    const quarter = d.vec2f(Math.SQRT1_2, Math.SQRT1_2);
    // the cap end of a 45 degree half-angle arc sits at (r * sin, r * cos)
    const end = d.vec3f(Math.SQRT1_2, Math.SQRT1_2, 0);
    expect(sdCappedTorus(end, quarter, 1, 0.25)).toBeCloseTo(-0.25);
    expect(sdCappedTorus(d.vec3f(1, -1, 0), quarter, 1, 0.25)).toBeCloseTo(
      Math.hypot(1 - Math.SQRT1_2, -1 - Math.SQRT1_2) - 0.25,
    );
  });

  it('is symmetric in x', () => {
    const p = d.vec3f(0.6, 0.4, 0.1);
    expect(sdCappedTorus(p, sc, 1, 0.25)).toBeCloseTo(
      sdCappedTorus(d.vec3f(-0.6, 0.4, 0.1), sc, 1, 0.25),
    );
  });

  it('resolves to WGSL', () => {
    expect(tgpu.resolve([sdCappedTorus])).toContain('fn sdCappedTorus');
  });
});

describe('sdHexagon2d', () => {
  it('is zero on edge midpoints and corners, negative inside, positive outside', () => {
    expect(sdHexagon2d(d.vec2f(0, 1), 1)).toBeCloseTo(0);
    expect(sdHexagon2d(d.vec2f(0, -1), 1)).toBeCloseTo(0);
    // slanted edge midpoint, 60 degrees from the top one
    expect(sdHexagon2d(d.vec2f(SQRT3 / 2, 0.5), 1)).toBeCloseTo(0);
    // corner: circumradius = inradius * 2 / sqrt(3)
    expect(sdHexagon2d(d.vec2f(2 / SQRT3, 0), 1)).toBeCloseTo(0);
    expect(sdHexagon2d(d.vec2f(0, 0), 1)).toBeCloseTo(-1);
    expect(sdHexagon2d(d.vec2f(0, 3), 1)).toBeCloseTo(2);
  });

  it('resolves to WGSL', () => {
    expect(tgpu.resolve([sdHexagon2d])).toContain('fn sdHexagon2d');
  });
});

describe('sdgHexagon2d', () => {
  // wrapped in objects, since `it.each` would spread a bare vector into its components
  const points = [
    [0.1, 1.7],
    [1.6, 0.3],
    [-1.2, -1.1],
    [0.3, 0.2],
    [-0.5, 0.6],
    [0.9, -0.2],
  ].map(([x, y]) => ({ x, y, p: d.vec2f(x, y) }));

  it.each(points)('matches sdHexagon2d at ($x, $y)', ({ p }) => {
    expect(sdgHexagon2d(p, 1).x).toBeCloseTo(sdHexagon2d(p, 1), 5);
  });

  it.each(points)('returns the finite-difference gradient at ($x, $y)', ({ p }) => {
    const h = 1e-3;
    const gx =
      (sdHexagon2d(d.vec2f(p.x + h, p.y), 1) - sdHexagon2d(d.vec2f(p.x - h, p.y), 1)) / (2 * h);
    const gy =
      (sdHexagon2d(d.vec2f(p.x, p.y + h), 1) - sdHexagon2d(d.vec2f(p.x, p.y - h), 1)) / (2 * h);
    const result = sdgHexagon2d(p, 1);
    expect(result.y).toBeCloseTo(gx, 2);
    expect(result.z).toBeCloseTo(gy, 2);
    expect(Math.hypot(result.y, result.z)).toBeCloseTo(1, 4);
  });

  it('returns a zero gradient instead of NaN exactly on the edge', () => {
    const result = sdgHexagon2d(d.vec2f(0, 1), 1);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  });

  it('resolves to WGSL', () => {
    expect(tgpu.resolve([sdgHexagon2d])).toContain('fn sdgHexagon2d');
  });
});
