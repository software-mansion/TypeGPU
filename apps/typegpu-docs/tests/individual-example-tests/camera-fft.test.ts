/**
 * @vitest-environment jsdom
 */

import { describe, expect, vi, type Mock } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('camera fft example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device, navigator: nav }) => {
    (nav.mediaDevices.getUserMedia as Mock).mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream);

    const shaderCodes = await runExampleTest(
      {
        category: 'image-processing',
        name: 'camera-fft',
        expectedCalls: 9,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(@builtin(vertex_index) vertexIndex: u32) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[vertexIndex], 0, 1), uv[vertexIndex]);
      }

      @group(1) @binding(1) var<uniform> targetPx: vec2f;

      @group(1) @binding(0) var inputTexture: texture_external;

      @group(0) @binding(0) var sampler_1: sampler;

      @fragment fn videoBlitFrag(@builtin(position) _arg_position: vec4f) -> @location(0) vec4f {
        var st = (_arg_position.xy / targetPx);
        return textureSampleBaseClampToEdge(inputTexture, sampler_1, st);
      }

      struct FillParams {
        videoW: u32,
        videoH: u32,
        padW: u32,
        padH: u32,
        padWLog2: u32,
        padWMask: u32,
        edgeWindow: u32,
      }

      @group(0) @binding(1) var<uniform> params: FillParams;

      @group(0) @binding(0) var video: texture_2d<f32>;

      @group(0) @binding(2) var<storage, read_write> out: array<vec2f>;

      @compute @workgroup_size(256) fn fillKernel(@builtin(global_invocation_id) _arg_gid: vec3u, @builtin(num_workgroups) _arg_numWorkgroups: vec3u) {
        const wg = 256u;
        let spanX = (_arg_numWorkgroups.x * wg);
        let spanY = (_arg_numWorkgroups.y * spanX);
        let tid = ((_arg_gid.x + (_arg_gid.y * spanX)) + (_arg_gid.z * spanY));
        let padW = params.padW;
        let padH = params.padH;
        let total = (padW * padH);
        if ((tid >= total)) {
          return;
        }
        let padWLog2 = params.padWLog2;
        let padWMask = params.padWMask;
        let x = (tid & padWMask);
        let y = (tid >> padWLog2);
        let videoW = params.videoW;
        let videoH = params.videoH;
        if (((x < videoW) && (y < videoH))) {
          var px = textureLoad(video, vec2i(i32(x), i32(y)), 0);
          var l = (((0.2126f * px.x) + (0.7152f * px.y)) + (0.0722f * px.z));
          if ((params.edgeWindow != 0u)) {
            let denomW = f32(max((videoW - 1u), 1u));
            let denomH = f32(max((videoH - 1u), 1u));
            let tx = (f32(x) / denomW);
            let ty = (f32(y) / denomH);
            const twoPi = 6.283185307179586;
            let hx = (0.5f * (1f - cos((twoPi * tx))));
            let hy = (0.5f * (1f - cos((twoPi * ty))));
            l = (l * (hx * hy));
          }
          out[tid] = vec2f(l, 0f);
        }
        else {
          out[tid] = vec2f();
        }
      }

      struct radix4UniformType {
        p: u32,
        n: u32,
        lineStride: u32,
        numLines: u32,
        twiddleOffset: u32,
        outputScale: f32,
      }

      @group(0) @binding(0) var<uniform> uniforms: radix4UniformType;

      @group(0) @binding(1) var<storage, read> twiddles: array<vec2f>;

      @group(0) @binding(2) var<storage, read> twiddlesLo: array<vec2f>;

      @group(0) @binding(3) var<storage, read> src: array<vec2f>;

      fn complexMul(a: vec2f, b: vec2f) -> vec2f {
        return vec2f(((a.x * b.x) - (a.y * b.y)), ((a.x * b.y) + (a.y * b.x)));
      }

      fn complexCmulDs(a: vec2f, wh: vec2f, wl: vec2f) -> vec2f {
        return (complexMul(a, wh) + complexMul(a, wl));
      }

      @group(0) @binding(4) var<storage, read_write> dst: array<vec2f>;

      @compute @workgroup_size(256) fn radix4StageKernel(@builtin(global_invocation_id) _arg_gid: vec3u, @builtin(num_workgroups) _arg_numWorkgroups: vec3u) {
        const wg = 256u;
        let spanX = (_arg_numWorkgroups.x * wg);
        let spanY = (_arg_numWorkgroups.y * spanX);
        let tid = ((_arg_gid.x + (_arg_gid.y * spanX)) + (_arg_gid.z * spanY));
        let n = uniforms.n;
        let quarter = (n >> 2u);
        let numLines = uniforms.numLines;
        let total = (numLines * quarter);
        if ((tid >= total)) {
          return;
        }
        let line = u32((f32(tid) / f32(quarter)));
        let i = (tid - (line * quarter));
        let p = uniforms.p;
        let k = (i & (p - 1u));
        let T = quarter;
        let lineStride = uniforms.lineStride;
        let base = (line * lineStride);
        let i0 = (base + i);
        let i1 = ((base + i) + T);
        let i2 = ((base + i) + (T << 1u));
        let i3 = ((base + i) + (T * 3u));
        let twOff = uniforms.twiddleOffset;
        let tbase = (twOff + (3u * k));
        let tw1_hi = (&twiddles[tbase]);
        let tw1_lo = (&twiddlesLo[tbase]);
        let tw2_hi = (&twiddles[(tbase + 1u)]);
        let tw2_lo = (&twiddlesLo[(tbase + 1u)]);
        let tw3_hi = (&twiddles[(tbase + 2u)]);
        let tw3_lo = (&twiddlesLo[(tbase + 2u)]);
        let a0 = (&src[i0]);
        let a1 = (&src[i1]);
        let a2 = (&src[i2]);
        let a3 = (&src[i3]);
        var u0 = (*a0);
        var u1 = complexCmulDs((*a1), (*tw1_hi), (*tw1_lo));
        var u2 = complexCmulDs((*a2), (*tw2_hi), (*tw2_lo));
        var u3 = complexCmulDs((*a3), (*tw3_hi), (*tw3_lo));
        var v0 = (u0 + u2);
        var v1 = (u0 - u2);
        var v2 = (u1 + u3);
        var du1 = (u1 - u3);
        var v3 = vec2f(du1.y, -(du1.x));
        var y0 = (v0 + v2);
        var y1 = (v1 + v3);
        var y2 = (v0 - v2);
        var y3 = (v1 - v3);
        let s = uniforms.outputScale;
        let outBase = ((base + ((i - k) << 2u)) + k);
        dst[outBase] = (y0 * s);
        dst[(outBase + p)] = (y1 * s);
        dst[(outBase + (p << 1u))] = (y2 * s);
        dst[((outBase + p) + (p << 1u))] = (y3 * s);
      }

      struct transposeUniformType {
        srcCols: u32,
        srcRows: u32,
      }

      @group(0) @binding(0) var<uniform> uniforms: transposeUniformType;

      var<workgroup> tile: array<vec2f, 272>;

      @group(0) @binding(1) var<storage, read> src: array<vec2f>;

      @group(0) @binding(2) var<storage, read_write> dst: array<vec2f>;

      @compute @workgroup_size(16, 16) fn transposeKernel(@builtin(local_invocation_id) _arg_lid: vec3u, @builtin(workgroup_id) _arg_wid: vec3u) {
        let lx = _arg_lid.x;
        let ly = _arg_lid.y;
        let srcCols = uniforms.srcCols;
        let srcRows = uniforms.srcRows;
        let j = ((_arg_wid.x * 16u) + lx);
        let i = ((_arg_wid.y * 16u) + ly);
        if (((i < srcRows) && (j < srcCols))) {
          let inIdx = ((i * srcCols) + j);
          tile[((ly * 17u) + lx)] = src[inIdx];
        }
        workgroupBarrier();
        let outJ = ((_arg_wid.x * 16u) + ly);
        let outI = ((_arg_wid.y * 16u) + lx);
        if (((outJ < srcCols) && (outI < srcRows))) {
          let outIdx = ((outJ * srcRows) + outI);
          let v = (&tile[((lx * 17u) + ly)]);
          dst[outIdx] = (*v);
        }
      }

      struct stockhamUniformType {
        ns: u32,
        n: u32,
        lineStride: u32,
        numLines: u32,
        direction: u32,
        outputScale: f32,
      }

      @group(0) @binding(0) var<uniform> uniforms: stockhamUniformType;

      @group(0) @binding(1) var<storage, read> twiddles: array<vec2f>;

      @group(0) @binding(2) var<storage, read> twiddlesLo: array<vec2f>;

      fn splitF32(x: f32) -> vec2f {
        let c = (4097f * x);
        let hi = (c - (c - x));
        let lo = (x - hi);
        return vec2f(hi, lo);
      }

      fn splitComplexFromVec2(w: vec2f) -> vec4f {
        var sx = splitF32(w.x);
        var sy = splitF32(w.y);
        return vec4f(sx.x, sy.x, sx.y, sy.y);
      }

      @group(0) @binding(3) var<storage, read> src: array<vec2f>;

      fn complexMul(a: vec2f, b: vec2f) -> vec2f {
        return vec2f(((a.x * b.x) - (a.y * b.y)), ((a.x * b.y) + (a.y * b.x)));
      }

      fn complexCmulDs(a: vec2f, wh: vec2f, wl: vec2f) -> vec2f {
        return (complexMul(a, wh) + complexMul(a, wl));
      }

      @group(0) @binding(4) var<storage, read_write> dst: array<vec2f>;

      @compute @workgroup_size(256) fn stockhamStageKernel(@builtin(global_invocation_id) _arg_gid: vec3u, @builtin(num_workgroups) _arg_numWorkgroups: vec3u) {
        const wg = 256u;
        let spanX = (_arg_numWorkgroups.x * wg);
        let spanY = (_arg_numWorkgroups.y * spanX);
        let tid = ((_arg_gid.x + (_arg_gid.y * spanX)) + (_arg_gid.z * spanY));
        let n = uniforms.n;
        let half = (n >> 1u);
        let numLines = uniforms.numLines;
        let total = (numLines * half);
        if ((tid >= total)) {
          return;
        }
        let j = (tid % half);
        let line = u32((f32(tid) / f32(half)));
        let lineStride = uniforms.lineStride;
        let base = (line * lineStride);
        let i0 = (base + j);
        let i1 = ((base + j) + half);
        let ns = uniforms.ns;
        let k = (j % ns);
        let twIdx = ((ns - 1u) + k);
        let wh = (&twiddles[twIdx]);
        let wl = (&twiddlesLo[twIdx]);
        let inv = (uniforms.direction != 0u);
        var wsum = ((*wh) + (*wl));
        var wcomb = vec2f(wsum.x, select(wsum.y, -(wsum.y), inv));
        var sp = splitComplexFromVec2(wcomb);
        let u = (&src[i0]);
        let t = (&src[i1]);
        var tv = complexCmulDs((*t), sp.xy, sp.zw);
        var v0 = ((*u) + tv);
        var v1 = ((*u) - tv);
        let s = uniforms.outputScale;
        let jDivNs = u32((f32(j) / f32(ns)));
        let idxD = ((jDivNs * (ns << 1u)) + (j % ns));
        dst[(base + idxD)] = (v0 * s);
        dst[((base + idxD) + ns)] = (v1 * s);
      }

      @group(0) @binding(1) var<storage, read> src: array<vec2f>;

      struct complexVec2ScaleUniformType {
        scale: f32,
      }

      @group(0) @binding(0) var<uniform> uniforms: complexVec2ScaleUniformType;

      @group(0) @binding(2) var<storage, read_write> dst: array<vec2f>;

      @compute @workgroup_size(256) fn scaleKernel(@builtin(global_invocation_id) _arg_gid: vec3u, @builtin(num_workgroups) _arg_numWorkgroups: vec3u) {
        const wg = 256u;
        let spanX = (_arg_numWorkgroups.x * wg);
        let spanY = (_arg_numWorkgroups.y * spanX);
        let tid = ((_arg_gid.x + (_arg_gid.y * spanX)) + (_arg_gid.z * spanY));
        let count = arrayLength((&src));
        if ((tid >= count)) {
          return;
        }
        let s = uniforms.scale;
        let v = (&src[tid]);
        dst[tid] = ((*v) * s);
      }

      struct filterParamsType {
        padW: u32,
        padH: u32,
        padWLog2: u32,
        padWMask: u32,
        padHLog2: u32,
        padHMask: u32,
        lowPassCutoff: f32,
        highPassCutoff: f32,
        swapSpectrumAxes: u32,
      }

      @group(0) @binding(1) var<uniform> params: filterParamsType;

      @group(0) @binding(0) var<storage, read_write> spectrum: array<vec2f>;

      @compute @workgroup_size(256) fn filterKernel(@builtin(global_invocation_id) _arg_gid: vec3u, @builtin(num_workgroups) _arg_numWorkgroups: vec3u) {
        const wg = 256u;
        let spanX = (_arg_numWorkgroups.x * wg);
        let spanY = (_arg_numWorkgroups.y * spanX);
        let tid = ((_arg_gid.x + (_arg_gid.y * spanX)) + (_arg_gid.z * spanY));
        let padW = params.padW;
        let padH = params.padH;
        if ((tid >= (padW * padH))) {
          return;
        }
        let padWLog2 = params.padWLog2;
        let padWMask = params.padWMask;
        let padHLog2 = params.padHLog2;
        let padHMask = params.padHMask;
        let swap = (params.swapSpectrumAxes != 0u);
        let kx = select((tid & padWMask), (tid >> padHLog2), swap);
        let ky = select((tid >> padWLog2), (tid & padHMask), swap);
        let x = kx;
        let y = ky;
        let nx = (padW - x);
        let ny = (padH - y);
        let rxf = f32(min(x, nx));
        let ryf = f32(min(y, ny));
        let r2 = ((rxf * rxf) + (ryf * ryf));
        let halfW = (padW >> 1u);
        let halfH = (padH >> 1u);
        let hw = f32(halfW);
        let hh = f32(halfH);
        let rMax = sqrt(((hw * hw) + (hh * hh)));
        let r = sqrt(r2);
        let lowC = (params.lowPassCutoff * rMax);
        let highC = (params.highPassCutoff * rMax);
        let lowMask = select(0f, 1f, (r <= lowC));
        let highPassOff = (params.highPassCutoff <= 0f);
        let highMaskInner = select(0f, 1f, (r > highC));
        let highMask = select(highMaskInner, 1f, highPassOff);
        let mask = (lowMask * highMask);
        spectrum[tid] *= mask;
      }

      struct magParamsType {
        padW: u32,
        padH: u32,
        exposure: f32,
        padWLog2: u32,
        padWMask: u32,
        swapSpectrumAxes: u32,
      }

      @group(0) @binding(1) var<uniform> params: magParamsType;

      @group(0) @binding(0) var<storage, read> spectrum: array<vec2f>;

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

      fn oklabToLinearRgb(lab: vec3f) -> vec3f {
        let l_ = ((lab.x + (0.3963377774f * lab.y)) + (0.2158037573f * lab.z));
        let m_ = ((lab.x - (0.1055613458f * lab.y)) - (0.0638541728f * lab.z));
        let s_ = ((lab.x - (0.0894841775f * lab.y)) - (1.291485548f * lab.z));
        let l = ((l_ * l_) * l_);
        let m = ((m_ * m_) * m_);
        let s = ((s_ * s_) * s_);
        return vec3f((((4.0767416621f * l) - (3.3077115913f * m)) + (0.2309699292f * s)), (((-1.2684380046f * l) + (2.6097574011f * m)) - (0.3413193965f * s)), (((-0.0041960863f * l) - (0.7034186147f * m)) + (1.707614701f * s)));
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
              let b_1 = ((((-0.0041960863f * l) - (0.7034186147f * m)) + (1.707614701f * s)) - 1f);
              let b1 = (((-0.0041960863f * ldt) - (0.7034186147f * mdt)) + (1.707614701f * sdt));
              let b2 = (((-0.0041960863f * ldt2) - (0.7034186147f * mdt2)) + (1.707614701f * sdt2));
              let u_b = (b1 / ((b1 * b1) - ((0.5f * b_1) * b2)));
              var t_b = (-(b_1) * u_b);
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

      @group(0) @binding(2) var outTex: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(256) fn magKernel(@builtin(global_invocation_id) _arg_gid: vec3u, @builtin(num_workgroups) _arg_numWorkgroups: vec3u) {
        const wg = 256u;
        let spanX = (_arg_numWorkgroups.x * wg);
        let spanY = (_arg_numWorkgroups.y * spanX);
        let tid = ((_arg_gid.x + (_arg_gid.y * spanX)) + (_arg_gid.z * spanY));
        let padW = params.padW;
        let padH = params.padH;
        if ((tid >= (padW * padH))) {
          return;
        }
        let padWLog2 = params.padWLog2;
        let padWMask = params.padWMask;
        let xLin = (tid & padWMask);
        let yLin = (tid >> padWLog2);
        let halfW = (padW >> 1u);
        let halfH = (padH >> 1u);
        let srcX = ((xLin + halfW) % padW);
        let srcY = ((yLin + halfH) % padH);
        let srcTid = select((srcX + (srcY << padWLog2)), ((srcX * padH) + srcY), (params.swapSpectrumAxes != 0u));
        let cShift = (&spectrum[srcTid]);
        let lenRaw = length((*cShift));
        let logv = ((log((1f + lenRaw)) * 0.2f) * exp2(params.exposure));
        let cv = saturate(logv);
        let L = (0.04f + (cv * 0.96f));
        let chroma = ((cv * (1f - cv)) * 0.32f);
        let invLen = (1f / max(lenRaw, 1e-20f));
        var lab = vec3f(L, ((chroma * invLen) * (*cShift).x), ((chroma * invLen) * (*cShift).y));
        var rgb = oklabToLinearRgb(gamutClipAdaptiveL05(lab));
        textureStore(outTex, vec2u(xLin, yLin), vec4f(rgb, 1f));
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(@builtin(vertex_index) vertexIndex: u32) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[vertexIndex], 0, 1), uv[vertexIndex]);
      }

      struct displayFbType {
        fbW: f32,
        fbH: f32,
        padW: f32,
        padH: f32,
        effW: f32,
        effH: f32,
        viewMode: u32,
      }

      @group(0) @binding(0) var<uniform> fb: displayFbType;

      @group(0) @binding(1) var spectrumTex: texture_2d<f32>;

      @group(0) @binding(2) var samp: sampler;

      @fragment fn spectrumFrag(@builtin(position) _arg_position: vec4f) -> @location(0) vec4f {
        let fbW = fb.fbW;
        let fbH = fb.fbH;
        let padW = fb.padW;
        let padH = fb.padH;
        let effW = fb.effW;
        let effH = fb.effH;
        let viewMode = fb.viewMode;
        let cw = select(padW, effW, (viewMode != 0u));
        let ch = select(padH, effH, (viewMode != 0u));
        let qx = (_arg_position.x / fbW);
        let qy = (_arg_position.y / fbH);
        let s = min((fbW / cw), (fbH / ch));
        let bw = ((cw * s) / fbW);
        let bh = ((ch * s) / fbH);
        let u0 = ((1f - bw) * 0.5f);
        let v0 = ((1f - bh) * 0.5f);
        let inContent = ((((qx >= u0) && (qx <= (u0 + bw))) && (qy >= v0)) && (qy <= (v0 + bh)));
        if (!inContent) {
          return vec4f(0.019999999552965164, 0.019999999552965164, 0.05000000074505806, 1);
        }
        let u = ((qx - u0) / bw);
        let v = ((qy - v0) / bh);
        var st = vec2f(select(u, (u * (effW / padW)), (viewMode != 0u)), select(v, (v * (effH / padH)), (viewMode != 0u)));
        var col = textureSampleLevel(spectrumTex, samp, st, 0);
        return vec4f(col.rgb, 1f);
      }"
    `);
  });
});
