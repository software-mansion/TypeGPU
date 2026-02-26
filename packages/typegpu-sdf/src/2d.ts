import tgpu from 'typegpu';
import { f32, type v2f, vec2f, vec3f } from 'typegpu/data';
import {
  abs,
  acos,
  clamp,
  cos,
  distance,
  dot,
  length,
  max,
  min,
  pow,
  saturate,
  sign,
  sin,
  sqrt,
} from 'typegpu/std';

/**
 * Signed distance function for a disk (filled circle)
 * @param point Point to evaluate
 * @param radius Radius of the disk
 */
export const sdDisk = tgpu.fn([vec2f, f32], f32)((point, radius) => {
  return length(point) - radius;
});

/**
 * Signed distance function for a 2d box (rectangle)
 * @param point Point to evaluate
 * @param size Half-dimensions of the box
 */
export const sdBox2d = tgpu.fn([vec2f, vec2f], f32)((point, size) => {
  'use gpu';
  const d = abs(point) - size;
  return length(max(d, vec2f(0))) + min(max(d.x, d.y), 0);
});

/**
 * Signed distance function for a rounded 2d box
 * @param point Point to evaluate
 * @param size Half-dimensions of the box
 * @param cornerRadius Box corner radius
 */
export const sdRoundedBox2d = tgpu
  .fn([vec2f, vec2f, f32], f32)((point, size, cornerRadius) => {
    'use gpu';
    const d = abs(point) - size + vec2f(cornerRadius);
    return length(max(d, vec2f(0))) + min(max(d.x, d.y), 0) - cornerRadius;
  });

/**
 * Signed distance function for a line segment
 * @param point Point to evaluate
 * @param A First endpoint of the line
 * @param B Second endpoint of the line
 */
export const sdLine = tgpu.fn([vec2f, vec2f, vec2f], f32)((point, A, B) => {
  'use gpu';
  const pa = point - A;
  const ba = B - A;
  const h = max(0, min(1, dot(pa, ba) / dot(ba, ba)));
  return distance(pa, ba * h);
});

const dot2 = (v: v2f) => {
  'use gpu';
  return dot(v, v);
};

/**
 * Signed distance function for a quadratic Bezier curve
 * @param point Point to evaluate
 * @param A First control point of the Bezier curve
 * @param B Second control point of the Bezier curve
 * @param C Third control point of the Bezier curve
 */
export const sdBezier = tgpu.fn([vec2f, vec2f, vec2f, vec2f], f32)(
  (point, A, B, C) => {
    'use gpu';
    const a = B - A;
    const b = A - B * 2 + C;
    const c = a * 2;
    const d = A - point;

    const dotB = max(dot(b, b), 0.0001);
    const kk = 1 / dotB;
    const kx = kk * dot(a, b);
    const ky = (kk * (f32(2) * dot(a, a) + dot(d, b))) / 3;
    const kz = kk * dot(d, a);

    let res = f32(0);
    const p = ky - kx * kx;
    const p3 = p * p * p;
    const q = kx * (2 * kx * kx - 3 * ky) + kz;
    let h = q * q + 4 * p3;

    if (h >= 0.0) {
      h = sqrt(h);
      const x = (vec2f(h, -h) - q) * 0.5;
      const uv = sign(x) * pow(abs(x), vec2f(1 / 3));
      const t = saturate(uv.x + uv.y - kx);
      res = dot2(d + (c + b * t) * t);
    } else {
      const z = sqrt(-p);
      const v = acos(q / (p * z * 2)) / 3;
      const m = cos(v);
      const n = sin(v) * 1.732050808; // sqrt(3)
      const t = saturate(vec3f(m + m, -n - m, n - m) * z - kx);

      res = min(
        dot2(d + (c + b * t.x) * t.x),
        dot2(d + (c + b * t.y) * t.y),
      );
    }

    return sqrt(res);
  },
);

const cross = (a: v2f, b: v2f) => {
  'use gpu';
  return a.x * b.y - a.y * b.x;
};

/**
 * A fast approximation of the signed distance function for a quadratic Bezier curve
 * @param point Point to evaluate
 * @param A First control point of the Bezier curve
 * @param B Second control point of the Bezier curve
 * @param C Third control point of the Bezier curve
 */
export const sdBezierApprox = tgpu.fn(
  [vec2f, vec2f, vec2f, vec2f],
  f32,
)((point, A, B, C) => {
  'use gpu';
  const i = A - C;
  const j = C - B;
  const k = B - A;
  const w = j - k;

  const v0 = A - point;
  const v1 = B - point;
  const v2 = C - point;

  const x = cross(v0, v2);
  const y = cross(v1, v0);
  const z = cross(v2, v1);

  const s = (j * y + k * z) * 2 - (i * x);

  const r = (y * z - x * x * 0.25) / dot2(s);
  const t = saturate((0.5 * x + y + r * dot(s, w)) / (x + y + z));

  const d = v0 + (2 * k + (w * t)) * t;
  return length(d);
});

/**
 * Computes the signed distance field for a pie shape (circular sector).
 *
 * @param point - The point to evaluate, in 2D space
 * @param sc - The sine/cosine of the pie's half-angle (`d.vec2f(std.sin(angle/2), std.cos(angle/2))`)
 * @param radius - The radius of the pie
 */
export const sdPie = tgpu.fn([vec2f, vec2f, f32], f32)((point, sc, radius) => {
  'use gpu';
  const p_w = vec2f(point);
  p_w.x = abs(point.x);
  const l = length(p_w) - radius;
  const m = distance(p_w, sc * (clamp(dot(p_w, sc), 0, radius)));
  return max(l, m * sign(sc.y * p_w.x - sc.x * p_w.y));
});
