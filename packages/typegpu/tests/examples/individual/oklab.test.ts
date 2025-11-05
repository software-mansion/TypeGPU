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
        var pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3f, -1), vec2f(-1, 3f));
        return fullScreenTriangle_Output_1(vec4f(pos[input.vertexIndex], 0f, 1f), pos[input.vertexIndex]);
      }

      struct Uniforms_5 {
        hue: f32,
        alpha: f32,
      }

      @group(0) @binding(0) var<uniform> uniforms_4: Uniforms_5;

      fn scaleView_6(pos: vec2f) -> vec2f {
        return vec2f((0.3f * pos.x), (((pos.y * 1.2f) + 1f) * 0.5f));
      }

      fn oklabToLinearRgb_7(lab: vec3f) -> vec3f {
        var l_ = ((lab.x + (0.3963377774f * lab.y)) + (0.2158037573f * lab.z));
        var m_ = ((lab.x - (0.1055613458f * lab.y)) - (0.0638541728f * lab.z));
        var s_ = ((lab.x - (0.0894841775f * lab.y)) - (1.291485548f * lab.z));
        var l = ((l_ * l_) * l_);
        var m = ((m_ * m_) * m_);
        var s = ((s_ * s_) * s_);
        return vec3f((((4.0767416621f * l) - (3.3077115913f * m)) + (0.2309699292f * s)), (((-1.2684380046 * l) + (2.6097574011f * m)) - (0.3413193965f * s)), (((-0.0041960863 * l) - (0.7034186147f * m)) + (1.707614701f * s)));
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
        if ((((-1.88170328 * a) - (0.80936493f * b)) > 1f)) {
          k0 = 1.19086277f;
          k1 = 1.76576728f;
          k2 = 0.59662641f;
          k3 = 0.75515197f;
          k4 = 0.56771245f;
          wl = 4.0767416621f;
          wm = -3.3077115913;
          ws = 0.2309699292f;
        }
        else {
          if ((((1.81444104f * a) - (1.19445276f * b)) > 1f)) {
            k0 = 0.73956515f;
            k1 = -0.45954404;
            k2 = 0.08285427f;
            k3 = 0.1254107f;
            k4 = 0.14503204f;
            wl = -1.2684380046;
            wm = 2.6097574011f;
            ws = -0.3413193965;
          }
          else {
            k0 = 1.35733652f;
            k1 = -0.00915799;
            k2 = -1.1513021;
            k3 = -0.50559606;
            k4 = 0.00692167f;
            wl = -0.0041960863;
            wm = -0.7034186147;
            ws = 1.707614701f;
          }
        }
        var k_l = ((0.3963377774f * a) + (0.2158037573f * b));
        var k_m = ((-0.1055613458 * a) - (0.0638541728f * b));
        var k_s = ((-0.0894841775 * a) - (1.291485548f * b));
        var S = ((((k0 + (k1 * a)) + (k2 * b)) + ((k3 * a) * a)) + ((k4 * a) * b));
      {
          var l_ = (1f + (S * k_l));
          var m_ = (1f + (S * k_m));
          var s_ = (1f + (S * k_s));
          var l = ((l_ * l_) * l_);
          var m = ((m_ * m_) * m_);
          var s = ((s_ * s_) * s_);
          var l_dS = (((3f * k_l) * l_) * l_);
          var m_dS = (((3f * k_m) * m_) * m_);
          var s_dS = (((3f * k_s) * s_) * s_);
          var l_dS2 = (((6f * k_l) * k_l) * l_);
          var m_dS2 = (((6f * k_m) * k_m) * m_);
          var s_dS2 = (((6f * k_s) * k_s) * s_);
          var f = (((wl * l) + (wm * m)) + (ws * s));
          var f1 = (((wl * l_dS) + (wm * m_dS)) + (ws * s_dS));
          var f2 = (((wl * l_dS2) + (wm * m_dS2)) + (ws * s_dS2));
          S = (S - ((f * f1) / ((f1 * f1) - ((0.5f * f) * f2))));
        }
        return S;
      }

      fn cbrt_11(x: f32) -> f32 {
        return (sign(x) * pow(abs(x), 0.3333333333333333f));
      }

      struct LC_12 {
        L: f32,
        C: f32,
      }

      fn findCusp_9(a: f32, b: f32) -> LC_12 {
        var S_cusp = computeMaxSaturation_10(a, b);
        var rgb_at_max = oklabToLinearRgb_7(vec3f(1f, (S_cusp * a), (S_cusp * b)));
        var L_cusp = cbrt_11((1f / max(max(rgb_at_max.x, rgb_at_max.y), rgb_at_max.z)));
        var C_cusp = (L_cusp * S_cusp);
        return LC_12(L_cusp, C_cusp);
      }

      fn findGamutIntersection_13(a: f32, b: f32, L1: f32, C1: f32, L0: f32, cusp: LC_12) -> f32 {
        var FLT_MAX = 3.40282346e+38;
        var t = 0f;
        if (((((L1 - L0) * cusp.C) - ((cusp.L - L0) * C1)) <= 0f)) {
          t = ((cusp.C * L0) / ((C1 * cusp.L) + (cusp.C * (L0 - L1))));
        }
        else {
          t = ((cusp.C * (L0 - 1f)) / ((C1 * (cusp.L - 1f)) + (cusp.C * (L0 - L1))));
      {
            var dL = (L1 - L0);
            var dC = C1;
            var k_l = ((0.3963377774f * a) + (0.2158037573f * b));
            var k_m = ((-0.1055613458 * a) - (0.0638541728f * b));
            var k_s = ((-0.0894841775 * a) - (1.291485548f * b));
            var l_dt = (dL + (dC * k_l));
            var m_dt = (dL + (dC * k_m));
            var s_dt = (dL + (dC * k_s));
      {
              var L = ((L0 * (1f - t)) + (t * L1));
              var C = (t * C1);
              var l_ = (L + (C * k_l));
              var m_ = (L + (C * k_m));
              var s_ = (L + (C * k_s));
              var l = ((l_ * l_) * l_);
              var m = ((m_ * m_) * m_);
              var s = ((s_ * s_) * s_);
              var ldt = (((3f * l_dt) * l_) * l_);
              var mdt = (((3f * m_dt) * m_) * m_);
              var sdt = (((3f * s_dt) * s_) * s_);
              var ldt2 = (((6f * l_dt) * l_dt) * l_);
              var mdt2 = (((6f * m_dt) * m_dt) * m_);
              var sdt2 = (((6f * s_dt) * s_dt) * s_);
              var r = ((((4.0767416621f * l) - (3.3077115913f * m)) + (0.2309699292f * s)) - 1f);
              var r1 = (((4.0767416621f * ldt) - (3.3077115913f * mdt)) + (0.2309699292f * sdt));
              var r2 = (((4.0767416621f * ldt2) - (3.3077115913f * mdt2)) + (0.2309699292f * sdt2));
              var u_r = (r1 / ((r1 * r1) - ((0.5f * r) * r2)));
              var t_r = (-r * u_r);
              var g = ((((-1.2684380046 * l) + (2.6097574011f * m)) - (0.3413193965f * s)) - 1f);
              var g1 = (((-1.2684380046 * ldt) + (2.6097574011f * mdt)) - (0.3413193965f * sdt));
              var g2 = (((-1.2684380046 * ldt2) + (2.6097574011f * mdt2)) - (0.3413193965f * sdt2));
              var u_g = (g1 / ((g1 * g1) - ((0.5f * g) * g2)));
              var t_g = (-g * u_g);
              var b2 = ((((-0.0041960863 * l) - (0.7034186147f * m)) + (1.707614701f * s)) - 1f);
              var b1 = (((-0.0041960863 * ldt) - (0.7034186147f * mdt)) + (1.707614701f * sdt));
              var b22 = (((-0.0041960863 * ldt2) - (0.7034186147f * mdt2)) + (1.707614701f * sdt2));
              var u_b = (b1 / ((b1 * b1) - ((0.5f * b2) * b22)));
              var t_b = (-b2 * u_b);
              t_r = select(FLT_MAX, t_r, (u_r >= 0f));
              t_g = select(FLT_MAX, t_g, (u_g >= 0f));
              t_b = select(FLT_MAX, t_b, (u_b >= 0f));
              t += min(t_r, min(t_g, t_b));
            }
          }
        }
        return t;
      }

      fn gamutClipAdaptiveL05_8(lab: vec3f) -> vec3f {
        var alpha = 0.2f;
        var L = lab.x;
        var eps = 1e-5;
        var C = max(eps, length(lab.yz));
        var a_ = (lab.y / C);
        var b_ = (lab.z / C);
        var Ld = (L - 0.5f);
        var e1 = ((0.5f + abs(Ld)) + (alpha * C));
        var L0 = (0.5f * (1f + (sign(Ld) * (e1 - sqrt(max(0f, ((e1 * e1) - (2f * abs(Ld)))))))));
        var cusp = findCusp_9(a_, b_);
        var t = clamp(findGamutIntersection_13(a_, b_, L, C, L0, cusp), 0f, 1f);
        var L_clipped = mix(L0, L, t);
        var C_clipped = (t * C);
        return vec3f(L_clipped, (C_clipped * a_), (C_clipped * b_));
      }

      fn linearToSrgb_15(linear: vec3f) -> vec3f {
        return select((12.92 * linear), ((1.055 * pow(linear, vec3f(0.4166666567325592))) - vec3f(0.054999999701976776)), (linear > vec3f(0.0031308000907301903)));
      }

      fn oklabToRgb_14(lab: vec3f) -> vec3f {
        return linearToSrgb_15(oklabToLinearRgb_7(gamutClipAdaptiveL05_8(lab)));
      }

      fn item_16(_arg_0: vec2f, _arg_1: vec3f) -> f32 {
        return 1f;
      }

      struct mainFragment_Input_17 {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment_3(input: mainFragment_Input_17) -> @location(0) vec4f {
        var hue = uniforms_4.hue;
        var pos = scaleView_6(input.uv);
        var lab = vec3f(pos.y, (pos.x * vec2f(cos(hue), sin(hue))));
        var rgb = oklabToLinearRgb_7(lab);
        var outOfGamut = (any((rgb < vec3f())) || any((rgb > vec3f(1))));
        var clipLab = gamutClipAdaptiveL05_8(lab);
        var color = oklabToRgb_14(lab);
        var patternScaled = ((item_16(input.uv, clipLab) * 0.1f) + 0.9f);
        return vec4f(select(color, (patternScaled * color), outOfGamut), 1f);
      }"
    `);
  });
});
