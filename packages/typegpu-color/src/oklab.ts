import tgpu from 'typegpu';
import { f32, struct, vec3f } from 'typegpu/data';
import {
  abs,
  clamp,
  length,
  max,
  min,
  mix,
  pow,
  select,
  sign,
  sqrt,
} from 'typegpu/std';
import { linearToSrgb, srgbToLinear } from './srgb.ts';

const cbrt = tgpu.fn([f32], f32)((x) => {
  return sign(x) * pow(abs(x), f32(1) / 3);
});

export const linearRgbToOklab = tgpu.fn([vec3f], vec3f)((rgb) => {
  const l = 0.4122214708 * rgb.x + 0.5363325363 * rgb.y + 0.0514459929 * rgb.z;
  const m = 0.2119034982 * rgb.x + 0.6806995451 * rgb.y + 0.1073969566 * rgb.z;
  const s = 0.0883024619 * rgb.x + 0.2817188376 * rgb.y + 0.6299787005 * rgb.z;

  const l_ = cbrt(l);
  const m_ = cbrt(m);
  const s_ = cbrt(s);

  return vec3f(
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  );
});

export const oklabToLinearRgb = tgpu.fn([vec3f], vec3f)((lab) => {
  const l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  const m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  const s_ = lab.x - 0.0894841775 * lab.y - 1.291485548 * lab.z;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return vec3f(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  );
});

/**
 * Finds the maximum saturation possible for a given hue that fits in sRGB.
 * Saturation here is defined as S = C/L,
 * a and b must be normalized so a^2 + b^2 == 1
 */

const computeMaxSaturation = tgpu.fn([f32, f32], f32)((a, b) => {
  // Max saturation will be when one of r, g or b goes below zero.

  // Select different coefficients depending on which component goes below zero first
  let k0 = f32(0);
  let k1 = f32(0);
  let k2 = f32(0);
  let k3 = f32(0);
  let k4 = f32(0);
  let wl = f32(0);
  let wm = f32(0);
  let ws = f32(0);

  if (-1.88170328 * a - 0.80936493 * b > 1) {
    // Red component
    k0 = 1.19086277;
    k1 = 1.76576728;
    k2 = 0.59662641;
    k3 = 0.75515197;
    k4 = 0.56771245;
    wl = 4.0767416621;
    wm = -3.3077115913;
    ws = 0.2309699292;
  } else if (1.81444104 * a - 1.19445276 * b > 1) {
    // Green component
    k0 = 0.73956515;
    k1 = -0.45954404;
    k2 = 0.08285427;
    k3 = 0.1254107;
    k4 = 0.14503204;
    wl = -1.2684380046;
    wm = 2.6097574011;
    ws = -0.3413193965;
  } else {
    // Blue component
    k0 = 1.35733652;
    k1 = -0.00915799;
    k2 = -1.1513021;
    k3 = -0.50559606;
    k4 = 0.00692167;
    wl = -0.0041960863;
    wm = -0.7034186147;
    ws = 1.707614701;
  }

  const k_l = 0.3963377774 * a + 0.2158037573 * b;
  const k_m = -0.1055613458 * a - 0.0638541728 * b;
  const k_s = -0.0894841775 * a - 1.291485548 * b;

  // Approximate max saturation using a polynomial:
  let S = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b;

  // Do one step Halley's method to get closer
  // this gives an error less than 10e6, except for some blue hues where the dS/dh is close to infinite
  // this should be sufficient for most applications, otherwise do two/three steps
  {
    const l_ = 1 + S * k_l;
    const m_ = 1 + S * k_m;
    const s_ = 1 + S * k_s;

    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    const l_dS = 3 * k_l * l_ * l_;
    const m_dS = 3 * k_m * m_ * m_;
    const s_dS = 3 * k_s * s_ * s_;

    const l_dS2 = 6 * k_l * k_l * l_;
    const m_dS2 = 6 * k_m * k_m * m_;
    const s_dS2 = 6 * k_s * k_s * s_;

    const f = wl * l + wm * m + ws * s;
    const f1 = wl * l_dS + wm * m_dS + ws * s_dS;
    const f2 = wl * l_dS2 + wm * m_dS2 + ws * s_dS2;

    S = S - (f * f1) / (f1 * f1 - 0.5 * f * f2);
  }

  return S;
});

const LC = struct({
  L: f32,
  C: f32,
});

/**
 * Finds L_cusp and C_cusp for a given hue
 * a and b must be normalized so a^2 + b^2 == 1
 */
const findCusp = tgpu.fn([f32, f32], LC)((a, b) => {
  // First, find the maximum saturation (saturation S = C/L)
  const S_cusp = computeMaxSaturation(a, b);

  // Convert to linear sRGB to find the first point where at least one of r,g or b >= 1:
  const rgb_at_max = oklabToLinearRgb(vec3f(1, S_cusp * a, S_cusp * b));
  const L_cusp = cbrt(1.0 / max(max(rgb_at_max.x, rgb_at_max.y), rgb_at_max.z));
  const C_cusp = L_cusp * S_cusp;

  return LC({ L: L_cusp, C: C_cusp });
});

/**
 * Finds intersection of the line defined by
 * L = L0 * (1 - t) + t * L1;
 * C = t * C1;
 * a and b must be normalized so a^2 + b^2 == 1
 */

const findGamutIntersection = tgpu.fn(
  [f32, f32, f32, f32, f32, LC],
  f32,
)((a, b, L1, C1, L0, cusp) => {
  const FLT_MAX = 3.40282346e38;

  // Find the intersection for upper and lower half separately
  let t = f32(0);
  if ((L1 - L0) * cusp.C - (cusp.L - L0) * C1 <= 0) {
    // Lower half

    t = (cusp.C * L0) / (C1 * cusp.L + cusp.C * (L0 - L1));
  } else {
    // Upper half

    // First intersect with triangle
    t = (cusp.C * (L0 - 1)) / (C1 * (cusp.L - 1) + cusp.C * (L0 - L1));

    // Then one step Halley's method
    {
      const dL = L1 - L0;
      const dC = C1;

      const k_l = 0.3963377774 * a + 0.2158037573 * b;
      const k_m = -0.1055613458 * a - 0.0638541728 * b;
      const k_s = -0.0894841775 * a - 1.291485548 * b;

      const l_dt = dL + dC * k_l;
      const m_dt = dL + dC * k_m;
      const s_dt = dL + dC * k_s;

      // If higher accuracy is required, 2 or 3 iterations of the following block can be used:
      {
        const L = L0 * (1 - t) + t * L1;
        const C = t * C1;

        const l_ = L + C * k_l;
        const m_ = L + C * k_m;
        const s_ = L + C * k_s;

        const l = l_ * l_ * l_;
        const m = m_ * m_ * m_;
        const s = s_ * s_ * s_;

        const ldt = 3 * l_dt * l_ * l_;
        const mdt = 3 * m_dt * m_ * m_;
        const sdt = 3 * s_dt * s_ * s_;

        const ldt2 = 6 * l_dt * l_dt * l_;
        const mdt2 = 6 * m_dt * m_dt * m_;
        const sdt2 = 6 * s_dt * s_dt * s_;

        const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s - 1;
        const r1 = 4.0767416621 * ldt - 3.3077115913 * mdt + 0.2309699292 * sdt;
        const r2 = 4.0767416621 * ldt2 - 3.3077115913 * mdt2 +
          0.2309699292 * sdt2;

        const u_r = r1 / (r1 * r1 - 0.5 * r * r2);
        let t_r = -r * u_r;

        const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s - 1;
        const g1 = -1.2684380046 * ldt + 2.6097574011 * mdt -
          0.3413193965 * sdt;
        const g2 = -1.2684380046 * ldt2 + 2.6097574011 * mdt2 -
          0.3413193965 * sdt2;

        const u_g = g1 / (g1 * g1 - 0.5 * g * g2);
        let t_g = -g * u_g;

        const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s - 1;
        const b1 = -0.0041960863 * ldt - 0.7034186147 * mdt + 1.707614701 * sdt;
        const b2 = -0.0041960863 * ldt2 - 0.7034186147 * mdt2 +
          1.707614701 * sdt2;

        const u_b = b1 / (b1 * b1 - 0.5 * b * b2);
        let t_b = -b * u_b;

        t_r = select(FLT_MAX, t_r, u_r >= 0);
        t_g = select(FLT_MAX, t_g, u_g >= 0);
        t_b = select(FLT_MAX, t_b, u_b >= 0);

        t += min(t_r, min(t_g, t_b));
      }
    }
  }

  return t;
});

const gamutClipPreserveChroma = tgpu.fn([vec3f], vec3f)((lab) => {
  const L = lab.x;
  const eps = 0.00001;
  const C = max(eps, length(lab.yz));
  const a_ = lab.y / C;
  const b_ = lab.z / C;
  const L0 = clamp(L, 0, 1);
  const cusp = findCusp(a_, b_);
  const t = clamp(findGamutIntersection(a_, b_, L, C, L0, cusp), 0, 1);
  const L_clipped = mix(L0, L, t);
  const C_clipped = t * C;

  return vec3f(L_clipped, C_clipped * a_, C_clipped * b_);
});

export const oklabGamutClipAlphaAccess = tgpu.accessor(f32, 0.2);

const gamutClipAdaptiveL05 = tgpu.fn([vec3f], vec3f)((lab) => {
  const alpha = oklabGamutClipAlphaAccess.$;
  const L = lab.x;
  const eps = 0.00001;
  const C = max(eps, length(lab.yz));
  const a_ = lab.y / C;
  const b_ = lab.z / C;

  const Ld = L - 0.5;
  const e1 = 0.5 + abs(Ld) + alpha * C;
  const L0 = 0.5 * (1 + sign(Ld) * (e1 - sqrt(max(0, e1 * e1 - 2 * abs(Ld)))));

  const cusp = findCusp(a_, b_);
  const t = clamp(findGamutIntersection(a_, b_, L, C, L0, cusp), 0, 1);
  const L_clipped = mix(L0, L, t);
  const C_clipped = t * C;

  return vec3f(L_clipped, C_clipped * a_, C_clipped * b_);
});

const gamutClipAdaptiveL0cusp = tgpu.fn([vec3f], vec3f)((lab) => {
  const alpha = oklabGamutClipAlphaAccess.$;
  const L = lab.x;
  const eps = 0.00001;
  const C = max(eps, length(lab.yz));
  const a_ = lab.y / C;
  const b_ = lab.z / C;

  const cusp = findCusp(a_, b_);
  const Ld = L - cusp.L;
  const k = 2 * select(cusp.L, 1 - cusp.L, Ld > 0);

  const e1 = 0.5 * k + abs(Ld) + (alpha * C) / k;
  const L0 = cusp.L +
    0.5 * (sign(Ld) * (e1 - sqrt(max(0, e1 * e1 - 2 * k * abs(Ld)))));

  const t = clamp(findGamutIntersection(a_, b_, L, C, L0, cusp), 0, 1);
  const L_clipped = mix(L0, L, t);
  const C_clipped = t * C;

  return vec3f(L_clipped, C_clipped * a_, C_clipped * b_);
});

export const oklabGamutClipSlot = tgpu.slot(gamutClipAdaptiveL05);
export const oklabGamutClip = {
  preserveChroma: gamutClipPreserveChroma,
  adaptiveL05: gamutClipAdaptiveL05,
  adaptiveL0Cusp: gamutClipAdaptiveL0cusp,
};

export const oklabToRgb = tgpu.fn([vec3f], vec3f)((lab) => {
  return linearToSrgb(oklabToLinearRgb(oklabGamutClipSlot.$(lab)));
});

export const rgbToOklab = tgpu.fn([vec3f], vec3f)((rgb) => {
  return linearRgbToOklab(srgbToLinear(rgb));
});
