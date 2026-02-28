/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('oklab example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simple',
        name: 'oklab',
        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct fullScreenTriangle_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(in: fullScreenTriangle_Input) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      struct item {
        hue: f32,
        alpha: f32,
      }

      @group(0) @binding(0) var<uniform> uniforms: item;

      fn scaleView(pos: vec2f) -> vec2f {
        return vec2f((0.3f * pos.x), (((pos.y * 1.2f) + 1f) * 0.5f));
      }

      fn oklabToLinearRgb(lab: vec3f) -> vec3f {
        let l_ = ((lab.x + (0.3963377774f * lab.y)) + (0.2158037573f * lab.z));
        let m_ = ((lab.x - (0.1055613458f * lab.y)) - (0.0638541728f * lab.z));
        let s_ = ((lab.x - (0.0894841775f * lab.y)) - (1.291485548f * lab.z));
        let l = ((l_ * l_) * l_);
        let m = ((m_ * m_) * m_);
        let s = ((s_ * s_) * s_);
        return vec3f((((4.0767416621f * l) - (3.3077115913f * m)) + (0.2309699292f * s)), (((-1.2684380046f * l) + (2.6097574011f * m)) - (0.3413193965f * s)), (((-0.0041960863f * l) - (0.7034186147f * m)) + (1.707614701f * s)));
      }

      fn computeMaxSaturation(a: f32, b: f32) -> f32 {
        var k0 = 0f;
        var k1 = 0f;
        var k2 = 0f;
        var k3 = 0f;
        var k4 = 0f;
        var wl = 0f;
        var wm = 0f;
        var ws = 0f;
        if ((((-1.88170328f * a) - (0.80936493f * b)) > 1f)) {
          k0 = 1.19086277f;
          k1 = 1.76576728f;
          k2 = 0.59662641f;
          k3 = 0.75515197f;
          k4 = 0.56771245f;
          wl = 4.0767416621f;
          wm = -3.3077115913f;
          ws = 0.2309699292f;
        }
        else {
          if ((((1.81444104f * a) - (1.19445276f * b)) > 1f)) {
            k0 = 0.73956515f;
            k1 = -0.45954404f;
            k2 = 0.08285427f;
            k3 = 0.1254107f;
            k4 = 0.14503204f;
            wl = -1.2684380046f;
            wm = 2.6097574011f;
            ws = -0.3413193965f;
          }
          else {
            k0 = 1.35733652f;
            k1 = -0.00915799f;
            k2 = -1.1513021f;
            k3 = -0.50559606f;
            k4 = 0.00692167f;
            wl = -0.0041960863f;
            wm = -0.7034186147f;
            ws = 1.707614701f;
          }
        }
        let k_l = ((0.3963377774f * a) + (0.2158037573f * b));
        let k_m = ((-0.1055613458f * a) - (0.0638541728f * b));
        let k_s = ((-0.0894841775f * a) - (1.291485548f * b));
        var S = ((((k0 + (k1 * a)) + (k2 * b)) + ((k3 * a) * a)) + ((k4 * a) * b));
        {
          let l_ = (1f + (S * k_l));
          let m_ = (1f + (S * k_m));
          let s_ = (1f + (S * k_s));
          let l = ((l_ * l_) * l_);
          let m = ((m_ * m_) * m_);
          let s = ((s_ * s_) * s_);
          let l_dS = (((3f * k_l) * l_) * l_);
          let m_dS = (((3f * k_m) * m_) * m_);
          let s_dS = (((3f * k_s) * s_) * s_);
          let l_dS2 = (((6f * k_l) * k_l) * l_);
          let m_dS2 = (((6f * k_m) * k_m) * m_);
          let s_dS2 = (((6f * k_s) * k_s) * s_);
          let f = (((wl * l) + (wm * m)) + (ws * s));
          let f1 = (((wl * l_dS) + (wm * m_dS)) + (ws * s_dS));
          let f2 = (((wl * l_dS2) + (wm * m_dS2)) + (ws * s_dS2));
          S = (S - ((f * f1) / ((f1 * f1) - ((0.5f * f) * f2))));
        }
        return S;
      }

      fn cbrt(x: f32) -> f32 {
        return (sign(x) * pow(abs(x), 0.3333333333333333f));
      }

      struct LC {
        L: f32,
        C: f32,
      }

      fn findCusp(a: f32, b: f32) -> LC {
        let S_cusp = computeMaxSaturation(a, b);
        var rgb_at_max = oklabToLinearRgb(vec3f(1f, (S_cusp * a), (S_cusp * b)));
        let L_cusp = cbrt((1f / max(max(rgb_at_max.x, rgb_at_max.y), rgb_at_max.z)));
        let C_cusp = (L_cusp * S_cusp);
        return LC(L_cusp, C_cusp);
      }

      fn findGamutIntersection(a: f32, b: f32, L1: f32, C1: f32, L0: f32, cusp: LC) -> f32 {
        const FLT_MAX = 3.40282346e+38;
        var t = 0f;
        if (((((L1 - L0) * cusp.C) - ((cusp.L - L0) * C1)) <= 0f)) {
          t = ((cusp.C * L0) / ((C1 * cusp.L) + (cusp.C * (L0 - L1))));
        }
        else {
          t = ((cusp.C * (L0 - 1f)) / ((C1 * (cusp.L - 1f)) + (cusp.C * (L0 - L1))));
          {
            let dL = (L1 - L0);
            let dC = C1;
            let k_l = ((0.3963377774f * a) + (0.2158037573f * b));
            let k_m = ((-0.1055613458f * a) - (0.0638541728f * b));
            let k_s = ((-0.0894841775f * a) - (1.291485548f * b));
            let l_dt = (dL + (dC * k_l));
            let m_dt = (dL + (dC * k_m));
            let s_dt = (dL + (dC * k_s));
            {
              let L = ((L0 * (1f - t)) + (t * L1));
              let C = (t * C1);
              let l_ = (L + (C * k_l));
              let m_ = (L + (C * k_m));
              let s_ = (L + (C * k_s));
              let l = ((l_ * l_) * l_);
              let m = ((m_ * m_) * m_);
              let s = ((s_ * s_) * s_);
              let ldt = (((3f * l_dt) * l_) * l_);
              let mdt = (((3f * m_dt) * m_) * m_);
              let sdt = (((3f * s_dt) * s_) * s_);
              let ldt2 = (((6f * l_dt) * l_dt) * l_);
              let mdt2 = (((6f * m_dt) * m_dt) * m_);
              let sdt2 = (((6f * s_dt) * s_dt) * s_);
              let r = ((((4.0767416621f * l) - (3.3077115913f * m)) + (0.2309699292f * s)) - 1f);
              let r1 = (((4.0767416621f * ldt) - (3.3077115913f * mdt)) + (0.2309699292f * sdt));
              let r2 = (((4.0767416621f * ldt2) - (3.3077115913f * mdt2)) + (0.2309699292f * sdt2));
              let u_r = (r1 / ((r1 * r1) - ((0.5f * r) * r2)));
              var t_r = (-(r) * u_r);
              let g = ((((-1.2684380046f * l) + (2.6097574011f * m)) - (0.3413193965f * s)) - 1f);
              let g1 = (((-1.2684380046f * ldt) + (2.6097574011f * mdt)) - (0.3413193965f * sdt));
              let g2 = (((-1.2684380046f * ldt2) + (2.6097574011f * mdt2)) - (0.3413193965f * sdt2));
              let u_g = (g1 / ((g1 * g1) - ((0.5f * g) * g2)));
              var t_g = (-(g) * u_g);
              let b2 = ((((-0.0041960863f * l) - (0.7034186147f * m)) + (1.707614701f * s)) - 1f);
              let b1 = (((-0.0041960863f * ldt) - (0.7034186147f * mdt)) + (1.707614701f * sdt));
              let b22 = (((-0.0041960863f * ldt2) - (0.7034186147f * mdt2)) + (1.707614701f * sdt2));
              let u_b = (b1 / ((b1 * b1) - ((0.5f * b2) * b22)));
              var t_b = (-(b2) * u_b);
              t_r = select(FLT_MAX, t_r, (u_r >= 0f));
              t_g = select(FLT_MAX, t_g, (u_g >= 0f));
              t_b = select(FLT_MAX, t_b, (u_b >= 0f));
              t += min(t_r, min(t_g, t_b));
            }
          }
        }
        return t;
      }

      fn gamutClipAdaptiveL05(lab: vec3f) -> vec3f {
        const alpha = 0.20000000298023224f;
        let L = lab.x;
        const eps = 1e-5;
        let C = max(eps, length(lab.yz));
        let a_ = (lab.y / C);
        let b_ = (lab.z / C);
        let Ld = (L - 0.5f);
        let e1 = ((0.5f + abs(Ld)) + (alpha * C));
        let L0 = (0.5f * (1f + (sign(Ld) * (e1 - sqrt(max(0f, ((e1 * e1) - (2f * abs(Ld)))))))));
        var cusp = findCusp(a_, b_);
        let t = clamp(findGamutIntersection(a_, b_, L, C, L0, cusp), 0f, 1f);
        let L_clipped = mix(L0, L, t);
        let C_clipped = (t * C);
        return vec3f(L_clipped, (C_clipped * a_), (C_clipped * b_));
      }

      fn linearToSrgb(linear: vec3f) -> vec3f {
        return select((12.92f * linear), ((1.055f * pow(linear, vec3f(0.4166666567325592))) - vec3f(0.054999999701976776)), (linear > vec3f(0.0031308000907301903)));
      }

      fn oklabToRgb(lab: vec3f) -> vec3f {
        return linearToSrgb(oklabToLinearRgb(gamutClipAdaptiveL05(lab)));
      }

      fn item_1(_arg_0: vec2f, _arg_1: vec3f) -> f32 {
        return 1f;
      }

      struct mainFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment(input: mainFragment_Input) -> @location(0) vec4f {
        var uv = ((input.uv - 0.5f) * vec2f(2, -2));
        let hue = uniforms.hue;
        var pos = scaleView(uv);
        var yzDir = vec2f(cos(hue), sin(hue));
        var lab = vec3f(pos.y, (yzDir * pos.x));
        var rgb = oklabToLinearRgb(lab);
        let outOfGamut = (any((rgb < vec3f())) || any((rgb > vec3f(1))));
        var clipLab = gamutClipAdaptiveL05(lab);
        var color = oklabToRgb(lab);
        let patternScaled = ((item_1(uv, clipLab) * 0.1f) + 0.9f);
        return vec4f(select(color, (color * patternScaled), outOfGamut), 1f);
      }"
    `);
  });
});
