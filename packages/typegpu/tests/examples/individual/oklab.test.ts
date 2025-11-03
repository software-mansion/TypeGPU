/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('oklab example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simple',
      name: 'oklab',
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct fullScreenTriangle_Output_1 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct fullScreenTriangle_Input_2 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn fullScreenTriangle_0(input: fullScreenTriangle_Input_2) -> fullScreenTriangle_Output_1 {
        var pos = array<vec2f, 3>(vec2f(-1), vec2f(3, -1), vec2f(-1, 3));
        return fullScreenTriangle_Output_1(vec4f(pos[input.vertexIndex], 0, 1), pos[input.vertexIndex]);
      }

      struct Uniforms_5 {
        hue: f32,
        alpha: f32,
      }

      @group(0) @binding(0) var<uniform> uniforms_4: Uniforms_5;

      fn scaleView_6(pos: vec2f) -> vec2f {
        return vec2f((0.3 * pos.x), (((pos.y * 1.2) + 1) * 0.5));
      }

      fn oklabToLinearRgb_7(lab: vec3f) -> vec3f {
        let l_ = ((lab.x + (0.3963377774 * lab.y)) + (0.2158037573 * lab.z));
        let m_ = ((lab.x - (0.1055613458 * lab.y)) - (0.0638541728 * lab.z));
        let s_ = ((lab.x - (0.0894841775 * lab.y)) - (1.291485548 * lab.z));
        let l = ((l_ * l_) * l_);
        let m = ((m_ * m_) * m_);
        let s = ((s_ * s_) * s_);
        return vec3f((((4.0767416621 * l) - (3.3077115913 * m)) + (0.2309699292 * s)), (((-1.2684380046 * l) + (2.6097574011 * m)) - (0.3413193965 * s)), (((-0.0041960863 * l) - (0.7034186147 * m)) + (1.707614701 * s)));
      }

      fn computeMaxSaturation_10(a: f32, b: f32) -> f32 {
        var k0 = 0f;
        var k1 = 0f;
        var k2 = 0f;
        var k3 = 0f;
        var k4 = 0f;
        var wl = 0f;
        var wm = 0f;
        var ws = 0f;
        if ((((-1.88170328 * a) - (0.80936493 * b)) > 1)) {
          k0 = 1.19086277;
          k1 = 1.76576728;
          k2 = 0.59662641;
          k3 = 0.75515197;
          k4 = 0.56771245;
          wl = 4.0767416621;
          wm = -3.3077115913;
          ws = 0.2309699292;
        }
        else {
          if ((((1.81444104 * a) - (1.19445276 * b)) > 1)) {
            k0 = 0.73956515;
            k1 = -0.45954404;
            k2 = 0.08285427;
            k3 = 0.1254107;
            k4 = 0.14503204;
            wl = -1.2684380046;
            wm = 2.6097574011;
            ws = -0.3413193965;
          }
          else {
            k0 = 1.35733652;
            k1 = -0.00915799;
            k2 = -1.1513021;
            k3 = -0.50559606;
            k4 = 0.00692167;
            wl = -0.0041960863;
            wm = -0.7034186147;
            ws = 1.707614701;
          }
        }
        let k_l = ((0.3963377774 * a) + (0.2158037573 * b));
        let k_m = ((-0.1055613458 * a) - (0.0638541728 * b));
        let k_s = ((-0.0894841775 * a) - (1.291485548 * b));
        var S = ((((k0 + (k1 * a)) + (k2 * b)) + ((k3 * a) * a)) + ((k4 * a) * b));
      {
          let l_ = (1 + (S * k_l));
          let m_ = (1 + (S * k_m));
          let s_ = (1 + (S * k_s));
          let l = ((l_ * l_) * l_);
          let m = ((m_ * m_) * m_);
          let s = ((s_ * s_) * s_);
          let l_dS = (((3 * k_l) * l_) * l_);
          let m_dS = (((3 * k_m) * m_) * m_);
          let s_dS = (((3 * k_s) * s_) * s_);
          let l_dS2 = (((6 * k_l) * k_l) * l_);
          let m_dS2 = (((6 * k_m) * k_m) * m_);
          let s_dS2 = (((6 * k_s) * k_s) * s_);
          let f = (((wl * l) + (wm * m)) + (ws * s));
          let f1 = (((wl * l_dS) + (wm * m_dS)) + (ws * s_dS));
          let f2 = (((wl * l_dS2) + (wm * m_dS2)) + (ws * s_dS2));
          S = (S - ((f * f1) / ((f1 * f1) - ((0.5 * f) * f2))));
        }
        return S;
      }

      fn cbrt_11(x: f32) -> f32 {
        return (sign(x) * pow(abs(x), 0.3333333333333333));
      }

      struct LC_12 {
        L: f32,
        C: f32,
      }

      fn findCusp_9(a: f32, b: f32) -> LC_12 {
        let S_cusp = computeMaxSaturation_10(a, b);
        var rgb_at_max = oklabToLinearRgb_7(vec3f(1, (S_cusp * a), (S_cusp * b)));
        let L_cusp = cbrt_11((1f / max(max(rgb_at_max.x, rgb_at_max.y), rgb_at_max.z)));
        let C_cusp = (L_cusp * S_cusp);
        return LC_12(L_cusp, C_cusp);
      }

      fn findGamutIntersection_13(a: f32, b: f32, L1: f32, C1: f32, L0: f32, cusp: LC_12) -> f32 {
        const FLT_MAX = 3.40282346e+38;
        var t = 0f;
        if (((((L1 - L0) * cusp.C) - ((cusp.L - L0) * C1)) <= 0)) {
          t = ((cusp.C * L0) / ((C1 * cusp.L) + (cusp.C * (L0 - L1))));
        }
        else {
          t = ((cusp.C * (L0 - 1)) / ((C1 * (cusp.L - 1)) + (cusp.C * (L0 - L1))));
      {
            let dL = (L1 - L0);
            let dC = C1;
            let k_l = ((0.3963377774 * a) + (0.2158037573 * b));
            let k_m = ((-0.1055613458 * a) - (0.0638541728 * b));
            let k_s = ((-0.0894841775 * a) - (1.291485548 * b));
            let l_dt = (dL + (dC * k_l));
            let m_dt = (dL + (dC * k_m));
            let s_dt = (dL + (dC * k_s));
      {
              let L = ((L0 * (1 - t)) + (t * L1));
              let C = (t * C1);
              let l_ = (L + (C * k_l));
              let m_ = (L + (C * k_m));
              let s_ = (L + (C * k_s));
              let l = ((l_ * l_) * l_);
              let m = ((m_ * m_) * m_);
              let s = ((s_ * s_) * s_);
              let ldt = (((3 * l_dt) * l_) * l_);
              let mdt = (((3 * m_dt) * m_) * m_);
              let sdt = (((3 * s_dt) * s_) * s_);
              let ldt2 = (((6 * l_dt) * l_dt) * l_);
              let mdt2 = (((6 * m_dt) * m_dt) * m_);
              let sdt2 = (((6 * s_dt) * s_dt) * s_);
              let r = ((((4.0767416621 * l) - (3.3077115913 * m)) + (0.2309699292 * s)) - 1);
              let r1 = (((4.0767416621 * ldt) - (3.3077115913 * mdt)) + (0.2309699292 * sdt));
              let r2 = (((4.0767416621 * ldt2) - (3.3077115913 * mdt2)) + (0.2309699292 * sdt2));
              let u_r = (r1 / ((r1 * r1) - ((0.5 * r) * r2)));
              var t_r = (-(r) * u_r);
              let g = ((((-1.2684380046 * l) + (2.6097574011 * m)) - (0.3413193965 * s)) - 1);
              let g1 = (((-1.2684380046 * ldt) + (2.6097574011 * mdt)) - (0.3413193965 * sdt));
              let g2 = (((-1.2684380046 * ldt2) + (2.6097574011 * mdt2)) - (0.3413193965 * sdt2));
              let u_g = (g1 / ((g1 * g1) - ((0.5 * g) * g2)));
              var t_g = (-(g) * u_g);
              let b2 = ((((-0.0041960863 * l) - (0.7034186147 * m)) + (1.707614701 * s)) - 1);
              let b1 = (((-0.0041960863 * ldt) - (0.7034186147 * mdt)) + (1.707614701 * sdt));
              let b22 = (((-0.0041960863 * ldt2) - (0.7034186147 * mdt2)) + (1.707614701 * sdt2));
              let u_b = (b1 / ((b1 * b1) - ((0.5 * b2) * b22)));
              var t_b = (-(b2) * u_b);
              t_r = select(FLT_MAX, t_r, (u_r >= 0));
              t_g = select(FLT_MAX, t_g, (u_g >= 0));
              t_b = select(FLT_MAX, t_b, (u_b >= 0));
              t += min(t_r, min(t_g, t_b));
            }
          }
        }
        return t;
      }

      fn gamutClipAdaptiveL05_8(lab: vec3f) -> vec3f {
        const alpha = 0.20000000298023224f;
        let L = lab.x;
        const eps = 1e-5;
        let C = max(eps, length(lab.yz));
        let a_ = (lab.y / C);
        let b_ = (lab.z / C);
        let Ld = (L - 0.5);
        let e1 = ((0.5 + abs(Ld)) + (alpha * C));
        let L0 = (0.5 * (1 + (sign(Ld) * (e1 - sqrt(max(0, ((e1 * e1) - (2 * abs(Ld)))))))));
        var cusp = findCusp_9(a_, b_);
        let t = clamp(findGamutIntersection_13(a_, b_, L, C, L0, cusp), 0, 1);
        let L_clipped = mix(L0, L, t);
        let C_clipped = (t * C);
        return vec3f(L_clipped, (C_clipped * a_), (C_clipped * b_));
      }

      fn linearToSrgb_15(linear: vec3f) -> vec3f {
        return select((12.92 * linear), ((1.055 * pow(linear, vec3f(0.4166666567325592))) - vec3f(0.054999999701976776)), (linear > vec3f(0.0031308000907301903)));
      }

      fn oklabToRgb_14(lab: vec3f) -> vec3f {
        return linearToSrgb_15(oklabToLinearRgb_7(gamutClipAdaptiveL05_8(lab)));
      }

      fn item_16(_arg_0: vec2f, _arg_1: vec3f) -> f32 {
        return 1;
      }

      struct mainFragment_Input_17 {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment_3(input: mainFragment_Input_17) -> @location(0) vec4f {
        let hue = uniforms_4.hue;
        var pos = scaleView_6(input.uv);
        var lab = vec3f(pos.y, (pos.x * vec2f(cos(hue), sin(hue))));
        var rgb = oklabToLinearRgb_7(lab);
        let outOfGamut = (any((rgb < vec3f())) || any((rgb > vec3f(1))));
        var clipLab = gamutClipAdaptiveL05_8(lab);
        var color = oklabToRgb_14(lab);
        let patternScaled = ((item_16(input.uv, clipLab) * 0.1) + 0.9);
        return vec4f(select(color, (patternScaled * color), outOfGamut), 1);
      }"
    `);
  });
});
