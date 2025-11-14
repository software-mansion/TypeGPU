import tgpu from 'typegpu';
import { f32, type v2f, vec2f, vec3f } from 'typegpu/data';
import {
  abs,
  acos,
  add,
  clamp,
  cos,
  dot,
  length,
  max,
  min,
  mul,
  pow,
  saturate,
  sign,
  sin,
  sqrt,
  sub,
} from 'typegpu/std';

/**
 * Signed distance function for a disk (filled circle)
 * @param p Point to evaluate
 * @param radius Radius of the disk
 */
export const sdDisk = tgpu.fn([vec2f, f32], f32)((p, radius) => {
  return length(p) - radius;
});

/**
 * Signed distance function for a 2d box
 * @param p Point to evaluate
 * @param size Half-dimensions of the box
 */
export const sdBox2d = tgpu.fn([vec2f, vec2f], f32)((p, size) => {
  const d = sub(abs(p), size);
  return length(max(d, vec2f(0))) + min(max(d.x, d.y), 0);
});

/**
 * Signed distance function for a rounded 2d box
 * @param p Point to evaluate
 * @param size Half-dimensions of the box
 * @param cornerRadius Box corner radius
 */
export const sdRoundedBox2d = tgpu
  .fn([vec2f, vec2f, f32], f32)((p, size, cornerRadius) => {
    const d = add(sub(abs(p), size), vec2f(cornerRadius));
    return length(max(d, vec2f(0))) + min(max(d.x, d.y), 0) - cornerRadius;
  });

/**
 * Signed distance function for a line segment
 * @param p Point to evaluate
 * @param a First endpoint of the line
 * @param b Second endpoint of the line
 */
export const sdLine = tgpu.fn([vec2f, vec2f, vec2f], f32)((p, a, b) => {
  const pa = sub(p, a);
  const ba = sub(b, a);
  const h = max(0, min(1, dot(pa, ba) / dot(ba, ba)));
  return length(sub(pa, ba.mul(h)));
});

const dot2 = (v: v2f) => {
  'use gpu';
  return dot(v, v);
};

/**
 * Signed distance function for a quadratic Bezier curve
 * @param pos Point to evaluate
 * @param A First control point of the Bezier curve
 * @param B Second control point of the Bezier curve
 * @param C Third control point of the Bezier curve
 */
export const sdBezier = tgpu.fn([vec2f, vec2f, vec2f, vec2f], f32)(
  (pos, A, B, C) => {
    const a = B.sub(A);
    const b = A.sub(B.mul(2)).add(C);
    const c = a.mul(f32(2));
    const d = A.sub(pos);

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
      const x = vec2f(h, -h).sub(q).mul(0.5);
      const uv = sign(x).mul(pow(abs(x), vec2f(1 / 3)));
      const t = clamp(uv.x + uv.y - kx, 0, 1);
      res = dot2(d.add(c.add(b.mul(t)).mul(t)));
    } else {
      const z = sqrt(-p);
      const v = acos(q / (p * z * 2)) / 3;
      const m = cos(v);
      const n = mul(sin(v), 1.732050808); // sqrt(3)
      const t = saturate(
        vec3f(m + m, -n - m, n - m)
          .mul(z)
          .sub(kx),
      );

      res = min(
        dot2(d.add(c.add(b.mul(t.x)).mul(t.x))),
        dot2(d.add(c.add(b.mul(t.y)).mul(t.y))),
      );
    }

    return sqrt(res);
  },
);

const cro = (a: v2f, b: v2f) => {
  'use gpu';
  return a.x * b.y - a.y * b.x;
};

export const sdBezierApprox = tgpu.fn(
  [vec2f, vec2f, vec2f, vec2f],
  f32,
)((pos, A, B, C) => {
  const i = A.sub(C);
  const j = C.sub(B);
  const k = B.sub(A);
  const w = j.sub(k);

  const v0 = A.sub(pos);
  const v1 = B.sub(pos);
  const v2 = C.sub(pos);

  const x = cro(v0, v2);
  const y = cro(v1, v0);
  const z = cro(v2, v1);

  const s = j.mul(y).add(k.mul(z)).mul(2).sub(i.mul(x));

  const r = (y * z - x * x * 0.25) / dot2(s);
  const t = saturate((0.5 * x + y + r * dot(s, w)) / (x + y + z));

  const d = v0.add(k.add(k).add(w.mul(t)).mul(t));
  return length(d);
});

export const sdPie = tgpu.fn([vec2f, vec2f, f32], f32)((p, c, r) => {
  const p_w = vec2f(p);
  p_w.x = abs(p.x);
  const l = length(p_w) - r;
  const m = length(p_w.sub(c.mul(clamp(dot(p_w, c), 0, r))));
  return max(l, m * sign(c.y * p_w.x - c.x * p_w.y));
});
