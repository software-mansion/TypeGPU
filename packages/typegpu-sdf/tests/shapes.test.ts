import { describe, expect, it } from 'vitest';
import { d, tgpu } from 'typegpu';
import { sdCappedTorus, sdgHexagon2d, sdHexagon2d, sdTorus } from '../src/index.ts';

const SQRT3 = Math.sqrt(3);

describe('sdTorus', () => {
  it('is zero on the surface, negative inside the tube and positive outside', () => {
    expect(sdTorus(d.vec3f(1.25, 0, 0), 1, 0.25)).toBeCloseTo(0);
    expect(sdTorus(d.vec3f(0, 0.25, -1), 1, 0.25)).toBeCloseTo(0);
    expect(sdTorus(d.vec3f(1, 0, 0), 1, 0.25)).toBeCloseTo(-0.25);
    expect(sdTorus(d.vec3f(0, 0, 0), 1, 0.25)).toBeCloseTo(0.75);
    expect(sdTorus(d.vec3f(0, 0, 2), 1, 0.25)).toBeCloseTo(0.75);
  });

  it('resolves to WGSL', () => {
    expect(tgpu.resolve([sdTorus])).toMatchInlineSnapshot(`
      "fn sdTorus(point: vec3f, majorRadius: f32, minorRadius: f32) -> f32 {
        let q = vec2f((length(point.xz) - majorRadius), point.y);
        return (length(q) - minorRadius);
      }"
    `);
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

  it('stays accurate for a tube much thinner than the torus', () => {
    // a large ratio makes the cancellation of an expanded |p|^2 + ra^2 - 2 * ra * k form show
    // up even in the f64 math these CPU tests run with
    expect(sdCappedTorus(d.vec3f(0, 1e8, 1e-4), sc, 1e8, 1e-4)).toBeCloseTo(0, 7);
    expect(sdCappedTorus(d.vec3f(0, 1e8, 3e-4), sc, 1e8, 1e-4)).toBeCloseTo(2e-4, 7);
  });

  it('resolves to WGSL', () => {
    expect(tgpu.resolve([sdCappedTorus])).toMatchInlineSnapshot(`
      "fn sdCappedTorus(point: vec3f, sc: vec2f, majorRadius: f32, minorRadius: f32) -> f32 {
        let p = vec3f(abs(point.x), point.yz);
        let dist = select(length(vec2f((length(p.xy) - majorRadius), p.z)), length(vec3f((p.xy - (sc * majorRadius)), p.z)), ((sc.y * p.x) > (sc.x * p.y)));
        return (dist - minorRadius);
      }"
    `);
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
    expect(tgpu.resolve([sdHexagon2d])).toMatchInlineSnapshot(`
      "fn sdHexagon2d(point: vec2f, radius: f32) -> f32 {
        let k = vec3f(-0.8660253882408142, 0.5, 0.5773502588272095);
        var p = abs(point);
        p -= (k.xy * (2f * min(dot(k.xy, p), 0f)));
        p -= vec2f(clamp(p.x, (-(k.z) * radius), (k.z * radius)), radius);
        return (length(p) * sign(p.y));
      }"
    `);
  });
});

describe('sdgHexagon2d', () => {
  // wrapped in objects, since `it.each` would spread a bare vector into its components
  const points = [
    { x: 0.1, y: 1.7 },
    { x: 1.6, y: 0.3 },
    { x: -1.2, y: -1.1 },
    { x: 0.3, y: 0.2 },
    { x: -0.5, y: 0.6 },
    { x: 0.9, y: -0.2 },
  ].map(({ x, y }) => ({ x, y, p: d.vec2f(x, y) }));

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

  it('keeps a unit gradient for tiny hexagons', () => {
    const result = sdgHexagon2d(d.vec2f(0, 2e-9), 1e-9);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(1);
  });

  it('resolves to WGSL', () => {
    expect(tgpu.resolve([sdgHexagon2d])).toMatchInlineSnapshot(`
      "fn sdgHexagon2d(point: vec2f, radius: f32) -> vec3f {
        let k = vec3f(-0.8660253882408142, 0.5, 0.5773502588272095);
        let s = sign(point);
        var p = abs(point);
        let w = dot(k.xy, p);
        p -= (k.xy * (2f * min(w, 0f)));
        p -= vec2f(clamp(p.x, (-(k.z) * radius), (k.z * radius)), radius);
        let d = (length(p) * sign(p.y));
        let g = select(p, vec2f(((-(k.y) * p.x) - (k.x * p.y)), ((-(k.x) * p.x) + (k.y * p.y))), (w < 0f));
        return vec3f(d, ((s * g) / d));
      }"
    `);
  });
});
