/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('lines combinations example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'geometry',
      name: 'lines-combinations',
      expectedCalls: 14,
      controlTriggers: ['Test Resolution'],
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Uniforms_2 {
        time: f32,
        fillType: u32,
      }

      @group(0) @binding(0) var<uniform> uniforms_1: Uniforms_2;

      struct LineSegmentVertex_4 {
        position: vec2f,
        radius: f32,
      }

      fn item_3(vertexIndex: u32, time: f32) -> LineSegmentVertex_4 {
        let s = sin(time);
        let c = cos(time);
        const r = 0.25;
        var points = array<vec2f, 4>(vec2f(((r * s) - 0.25f), (r * c)), vec2f(-0.25, 0), vec2f(0.25, 0), vec2f(((-(r) * s) + 0.25f), (r * c)));
        let i = clamp((i32(vertexIndex) - 1i), 0i, 3i);
        return LineSegmentVertex_4(points[i], 0.2f);
      }

      struct mainVertex_Output_5 {
        @builtin(position) outPos: vec4f,
        @location(0) position: vec2f,
        @location(1) uv: vec2f,
        @location(2) @interpolate(flat) instanceIndex: u32,
        @location(3) @interpolate(flat) vertexIndex: u32,
        @location(4) @interpolate(flat) situationIndex: u32,
      }

      struct JoinPath_8 {
        joinIndex: u32,
        path: u32,
        depth: i32,
      }

      fn getJoinParent_9(i: u32) -> u32 {
        return ((i - 4u) >> 1u);
      }

      fn getJoinVertexPath_7(vertexIndex: u32) -> JoinPath_8 {
        var lookup = array<u32, 10>(0u, 0u, 0u, 1u, 1u, 2u, 2u, 2u, 3u, 3u);
        if ((vertexIndex < 10u)) {
          return JoinPath_8(lookup[vertexIndex], 0u, -1i);
        }
        var joinIndex = (vertexIndex - 10u);
        var depth = 0;
        var path = 0u;
        while ((joinIndex >= 4u)) {
          path = ((path << 1u) | (joinIndex & 1u));
          joinIndex = getJoinParent_9(joinIndex);
          depth += 1i;
        }
        return JoinPath_8(joinIndex, path, depth);
      }

      struct LineSegmentOutput_10 {
        vertexPosition: vec2f,
        situationIndex: u32,
      }

      struct ExternalNormals_12 {
        n1: vec2f,
        n2: vec2f,
      }

      fn externalNormals_11(distance: vec2f, r1: f32, r2: f32) -> ExternalNormals_12 {
        var dNorm = normalize(distance);
        let expCos = ((r1 - r2) / length(distance));
        let expSin = sqrt(max(0f, (1f - (expCos * expCos))));
        let a = (dNorm.x * expCos);
        let b = (dNorm.y * expSin);
        let c = (dNorm.x * expSin);
        let d = (dNorm.y * expCos);
        var n1 = vec2f((a - b), (c + d));
        var n2 = vec2f((a + b), (-(c) + d));
        return ExternalNormals_12(n1, n2);
      }

      fn cross2d_14(a: vec2f, b: vec2f) -> f32 {
        return ((a.x * b.y) - (a.y * b.x));
      }

      fn isCCW_15(aX: f32, aYSign: bool, bX: f32, bYSign: bool) -> bool {
        let sameSide = (aYSign == bYSign);
        return select(aYSign, (aYSign == (aX >= bX)), sameSide);
      }

      const lookup_17: array<u32, 8> = array<u32, 8>(5u, 3u, 4u, 3u, 2u, 1u, 0u, 0u);

      fn rank3_16(aGb: bool, bGc: bool, aGc: bool) -> u32 {
        let code = (((u32(aGb) << 2u) | (u32(bGc) << 1u)) | u32(aGc));
        return lookup_17[code];
      }

      fn joinSituationIndex_13(ul: vec2f, ur: vec2f, dl: vec2f, dr: vec2f) -> u32 {
        let crossUL = cross2d_14(ur, ul);
        let crossDL = cross2d_14(ur, dl);
        let crossDR = cross2d_14(ur, dr);
        let signUL = (crossUL >= 0f);
        let signDL = (crossDL >= 0f);
        let signDR = (crossDR >= 0f);
        let dotUL = dot(ur, ul);
        let dotDL = dot(ur, dl);
        let dotDR = dot(ur, dr);
        return rank3_16(isCCW_15(dotUL, signUL, dotDL, signDL), isCCW_15(dotDL, signDL, dotDR, signDR), isCCW_15(dotUL, signUL, dotDR, signDR));
      }

      const JOIN_LIMIT_18: f32 = 0.999f;

      fn rot90ccw_21(v: vec2f) -> vec2f {
        return vec2f(-(v.y), v.x);
      }

      fn rot90cw_22(v: vec2f) -> vec2f {
        return vec2f(v.y, -(v.x));
      }

      fn bisectCcw_20(a: vec2f, b: vec2f) -> vec2f {
        let sin = cross2d_14(a, b);
        let sinSign = select(-1f, 1f, (sin >= 0f));
        var orthoA = rot90ccw_21(a);
        var orthoB = rot90cw_22(b);
        var dir = select(((a + b) * sinSign), (orthoA + orthoB), (dot(a, b) < 0f));
        return normalize(dir);
      }

      fn midPoint_23(a: vec2f, b: vec2f) -> vec2f {
        return (0.5 * (a + b));
      }

      fn addMul_24(a: vec2f, b: vec2f, f: f32) -> vec2f {
        return (a + (b * f));
      }

      fn miterPoint_19(a: vec2f, b: vec2f) -> vec2f {
        let sin_ = cross2d_14(a, b);
        var bisection = bisectCcw_20(a, b);
        let b2 = dot(b, b);
        let cos_ = dot(a, b);
        let diff = (b2 - cos_);
        if (((diff * diff) < 1e-4f)) {
          return midPoint_23(a, b);
        }
        if ((sin_ < 0f)) {
          return (bisection * -1000000);
        }
        let t = (diff / sin_);
        return addMul_24(a, rot90ccw_21(a), t);
      }

      struct LimitAlongResult_26 {
        a: vec2f,
        b: vec2f,
        limitWasHit: bool,
      }

      fn limitTowardsMiddle_25(middle: vec2f, dir: vec2f, p1: vec2f, p2: vec2f) -> LimitAlongResult_26 {
        let t1 = dot((p1 - middle), dir);
        let t2 = dot((p2 - middle), dir);
        if ((t1 <= t2)) {
          return LimitAlongResult_26(p1, p2, false);
        }
        let t = clamp((t1 / (t1 - t2)), 0f, 1f);
        var p = mix(p1, p2, t);
        return LimitAlongResult_26(p, p, true);
      }

      fn bisectNoCheck_28(a: vec2f, b: vec2f) -> vec2f {
        return normalize((a + b));
      }

      fn item_27(vertexIndex: u32, joinPath: JoinPath_8, V: LineSegmentVertex_4, vu: vec2f, vd: vec2f, right: vec2f, dir: vec2f, left: vec2f) -> vec2f {
        var uR = right;
        var u = dir;
        var c = dir;
        var d = dir;
        var dR = left;
        let joinIndex = joinPath.joinIndex;
        if ((joinPath.depth >= 0i)) {
          var parents = array<vec2f, 4>(uR, u, d, dR);
          var d0 = parents[((joinIndex * 2u) & 3u)];
          var d1 = parents[(((joinIndex * 2u) + 1u) & 3u)];
          var dm = bisectCcw_20(d0, d1);
          var path = joinPath.path;
          for (var depth = joinPath.depth; (depth > 0i); depth -= 1i) {
            let isLeftChild = ((path & 1u) == 0u);
            d0 = select(dm, d0, isLeftChild);
            d1 = select(d1, dm, isLeftChild);
            dm = bisectNoCheck_28(d0, d1);
            path >>= 1u;
          }
          return addMul_24(V.position, dm, V.radius);
        }
        var v1 = addMul_24(V.position, u, V.radius);
        var v2 = addMul_24(V.position, c, V.radius);
        var v3 = addMul_24(V.position, d, V.radius);
        var points = array<vec2f, 5>(vu, v1, v2, v3, vd);
        return points[(vertexIndex % 5u)];
      }

      struct Intersection_31 {
        valid: bool,
        t: f32,
        point: vec2f,
      }

      fn intersectLines_30(A1: vec2f, A2: vec2f, B1: vec2f, B2: vec2f) -> Intersection_31 {
        var a = (A2 - A1);
        var b = (B2 - B1);
        let axb = cross2d_14(a, b);
        var AB = (B1 - A1);
        let t = (cross2d_14(AB, b) / axb);
        return Intersection_31((axb != 0f), t, addMul_24(A1, a, t));
      }

      fn item_29(situationIndex: u32, vertexIndex: u32, joinPath: JoinPath_8, V: LineSegmentVertex_4, vu: vec2f, vd: vec2f, ul: vec2f, ur: vec2f, dl: vec2f, dr: vec2f, joinU: bool, joinD: bool) -> vec2f {
        var midU = bisectCcw_20(ur, ul);
        var midD = bisectCcw_20(dl, dr);
        var midR = bisectCcw_20(ur, dr);
        var midL = bisectCcw_20(dl, ul);
        let shouldCross = ((situationIndex == 1u) || (situationIndex == 4u));
        var crossCenter = intersectLines_30(ul, dl, ur, dr).point;
        var averageCenter = (((ur + ul) + (dl + dr)) * 0.25);
        var uR = ur;
        var u = midU;
        var c = select(averageCenter, crossCenter, shouldCross);
        var d = midD;
        var dR = dr;
        if ((situationIndex == 2u)) {
          uR = ur;
          u = midR;
          c = midR;
          d = midR;
          dR = dr;
        }
        if ((situationIndex == 3u)) {
          uR = ur;
          u = midL;
          c = midL;
          d = midL;
          dR = dr;
        }
        let joinIndex = joinPath.joinIndex;
        if ((joinPath.depth >= 0i)) {
          var parents = array<vec2f, 4>(uR, u, d, dR);
          var d0 = parents[((joinIndex * 2u) & 3u)];
          var d1 = parents[(((joinIndex * 2u) + 1u) & 3u)];
          var dm = bisectCcw_20(d0, d1);
          var path = joinPath.path;
          for (var depth = joinPath.depth; (depth > 0i); depth -= 1i) {
            let isLeftChild = ((path & 1u) == 0u);
            d0 = select(dm, d0, isLeftChild);
            d1 = select(d1, dm, isLeftChild);
            dm = bisectNoCheck_28(d0, d1);
            path >>= 1u;
          }
          return addMul_24(V.position, dm, V.radius);
        }
        var v1 = select(vu, addMul_24(V.position, u, V.radius), joinU);
        var v2 = select(vu, addMul_24(V.position, c, V.radius), (joinU || joinD));
        var v3 = select(vd, addMul_24(V.position, d, V.radius), joinD);
        var points = array<vec2f, 5>(vu, v1, v2, v3, vd);
        return points[(vertexIndex % 5u)];
      }

      fn lineSegmentVariableWidth_6(vertexIndex: u32, A: LineSegmentVertex_4, B: LineSegmentVertex_4, C: LineSegmentVertex_4, D: LineSegmentVertex_4) -> LineSegmentOutput_10 {
        var joinPath = getJoinVertexPath_7(vertexIndex);
        var AB = (B.position - A.position);
        var BC = (C.position - B.position);
        var CD = (D.position - C.position);
        let radiusABDelta = (A.radius - B.radius);
        let radiusBCDelta = (B.radius - C.radius);
        let radiusCDDelta = (C.radius - D.radius);
        if ((dot(BC, BC) <= (radiusBCDelta * radiusBCDelta))) {
          return LineSegmentOutput_10(vec2f(), 0u);
        }
        let isCapB = (dot(AB, AB) <= ((radiusABDelta * radiusABDelta) + 1e-12f));
        let isCapC = (dot(CD, CD) <= ((radiusCDDelta * radiusCDDelta) + 1e-12f));
        var eAB = externalNormals_11(AB, A.radius, B.radius);
        var eBC = externalNormals_11(BC, B.radius, C.radius);
        var eCD = externalNormals_11(CD, C.radius, D.radius);
        var nBC = normalize(BC);
        var nCB = (nBC * -1);
        var d0 = eBC.n1;
        var d4 = eBC.n2;
        var d5 = eBC.n2;
        var d9 = eBC.n1;
        let situationIndexB = joinSituationIndex_13(eAB.n1, eBC.n1, eAB.n2, eBC.n2);
        let situationIndexC = joinSituationIndex_13(eCD.n2, eBC.n2, eCD.n1, eBC.n1);
        var joinBu = true;
        var joinBd = true;
        var joinCu = true;
        var joinCd = true;
        if (!isCapB) {
          if ((((situationIndexB == 1u) || (situationIndexB == 5u)) || (dot(eBC.n2, eAB.n2) > JOIN_LIMIT_18))) {
            d4 = miterPoint_19(eBC.n2, eAB.n2);
            joinBd = false;
          }
          if ((((situationIndexB == 4u) || (situationIndexB == 5u)) || (dot(eAB.n1, eBC.n1) > JOIN_LIMIT_18))) {
            d0 = miterPoint_19(eAB.n1, eBC.n1);
            joinBu = false;
          }
        }
        if (!isCapC) {
          if ((((situationIndexC == 4u) || (situationIndexC == 5u)) || (dot(eCD.n2, eBC.n2) > JOIN_LIMIT_18))) {
            d5 = miterPoint_19(eCD.n2, eBC.n2);
            joinCd = false;
          }
          if ((((situationIndexC == 1u) || (situationIndexC == 5u)) || (dot(eBC.n1, eCD.n1) > JOIN_LIMIT_18))) {
            d9 = miterPoint_19(eBC.n1, eCD.n1);
            joinCu = false;
          }
        }
        var v0 = addMul_24(B.position, d0, B.radius);
        var v4 = addMul_24(B.position, d4, B.radius);
        var v5 = addMul_24(C.position, d5, C.radius);
        var v9 = addMul_24(C.position, d9, C.radius);
        var midBC = midPoint_23(B.position, C.position);
        var tBC1 = rot90cw_22(eBC.n1);
        var tBC2 = rot90ccw_21(eBC.n2);
        var limU = limitTowardsMiddle_25(midBC, tBC1, v0, v9);
        var limD = limitTowardsMiddle_25(midBC, tBC2, v4, v5);
        v0 = limU.a;
        v9 = limU.b;
        v4 = limD.a;
        v5 = limD.b;
        let isCSide = (joinPath.joinIndex >= 2u);
        var situationIndex = situationIndexB;
        var V = B;
        var isCap = isCapB;
        var j1 = eAB.n1;
        var j2 = eBC.n1;
        var j3 = eAB.n2;
        var j4 = eBC.n2;
        var vu = v0;
        var vd = v4;
        var joinU = joinBu;
        var joinD = joinBd;
        if (isCSide) {
          situationIndex = situationIndexC;
          V = C;
          isCap = isCapC;
          j4 = eBC.n1;
          j3 = eCD.n1;
          j2 = eBC.n2;
          j1 = eCD.n2;
          vu = v5;
          vd = v9;
          joinU = joinCd;
          joinD = joinCu;
        }
        let joinIndex = joinPath.joinIndex;
        if ((vertexIndex >= 10u)) {
          var shouldJoin = array<u32, 4>(u32(joinBu), u32(joinBd), u32(joinCd), u32(joinCu));
          if ((shouldJoin[joinIndex] == 0u)) {
            var noJoinPoints = array<vec2f, 4>(v0, v4, v5, v9);
            let vertexPosition2 = (&noJoinPoints[joinIndex]);
            return LineSegmentOutput_10((*vertexPosition2), situationIndex);
          }
        }
        var vertexPosition = vec2f();
        if (isCap) {
          if (isCSide) {
            vertexPosition = item_27(vertexIndex, joinPath, V, vu, vd, j2, nBC, j4);
          }
          else {
            vertexPosition = item_27(vertexIndex, joinPath, V, vu, vd, j2, nCB, j4);
          }
        }
        else {
          vertexPosition = item_29(situationIndex, vertexIndex, joinPath, V, vu, vd, j1, j2, j3, j4, joinU, joinD);
        }
        return LineSegmentOutput_10(vertexPosition, situationIndex);
      }

      fn uvToLineSegment_32(A: vec2f, B: vec2f, point: vec2f) -> vec2f {
        var p = (point - A);
        var AB = (B - A);
        let x = (dot(p, AB) / dot(AB, AB));
        let y = cross2d_14(normalize(AB), p);
        return vec2f(x, y);
      }

      struct mainVertex_Input_33 {
        @builtin(instance_index) instanceIndex: u32,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex_0(_arg_0: mainVertex_Input_33) -> mainVertex_Output_5 {
        let t = uniforms_1.time;
        var A = item_3(_arg_0.instanceIndex, t);
        var B = item_3((_arg_0.instanceIndex + 1u), t);
        var C = item_3((_arg_0.instanceIndex + 2u), t);
        var D = item_3((_arg_0.instanceIndex + 3u), t);
        if (((((A.radius < 0f) || (B.radius < 0f)) || (C.radius < 0f)) || (D.radius < 0f))) {
          return mainVertex_Output_5(vec4f(), vec2f(), vec2f(), 0u, 0u, 0u);
        }
        var result = lineSegmentVariableWidth_6(_arg_0.vertexIndex, A, B, C, D);
        var uv = uvToLineSegment_32(B.position, C.position, result.vertexPosition);
        return mainVertex_Output_5(vec4f(result.vertexPosition, 0f, 1f), result.vertexPosition, uv, _arg_0.instanceIndex, _arg_0.vertexIndex, result.situationIndex);
      }

      struct mainFragment_Input_35 {
        @location(2) @interpolate(flat) instanceIndex: u32,
        @location(3) @interpolate(flat) vertexIndex: u32,
        @location(4) @interpolate(flat) situationIndex: u32,
        @builtin(front_facing) frontFacing: bool,
        @builtin(position) screenPosition: vec4f,
        @location(0) position: vec2f,
        @location(1) uv: vec2f,
      }

      @fragment fn mainFragment_34(_arg_0: mainFragment_Input_35) -> @location(0) vec4f {
        let fillType2 = uniforms_1.fillType;
        if ((fillType2 == 1u)) {
          return mix(vec4f(0.7699999809265137, 0.38999998569488525, 1, 0.5), vec4f(0.10999999940395355, 0.4399999976158142, 0.9399999976158142, 0.5), ((_arg_0.position.x * 0.5f) + 0.5f));
        }
        var color = vec3f();
        var colors = array<vec3f, 9>(vec3f(1, 0, 0), vec3f(0, 1, 0), vec3f(0, 0, 1), vec3f(1, 0, 1), vec3f(1, 1, 0), vec3f(0, 1, 1), vec3f(0.75, 0.25, 0.25), vec3f(0.25, 0.75, 0.25), vec3f(0.25, 0.25, 0.75));
        if ((fillType2 == 2u)) {
          color = colors[(_arg_0.instanceIndex % 9u)];
        }
        if ((fillType2 == 3u)) {
          color = colors[(_arg_0.vertexIndex % 9u)];
        }
        if ((fillType2 == 4u)) {
          color = colors[(_arg_0.situationIndex % 9u)];
        }
        if ((fillType2 == 5u)) {
          color = vec3f(_arg_0.uv.x, cos((_arg_0.uv.y * 100f)), 0f);
        }
        if (_arg_0.frontFacing) {
          return vec4f(color, 0.5f);
        }
        return vec4f(color, select(0f, 1f, (((u32(_arg_0.screenPosition.x) >> 3u) % 2u) != ((u32(_arg_0.screenPosition.y) >> 3u) % 2u))));
      }

      struct Uniforms_2 {
        time: f32,
        fillType: u32,
      }

      @group(0) @binding(0) var<uniform> uniforms_1: Uniforms_2;

      struct LineSegmentVertex_4 {
        position: vec2f,
        radius: f32,
      }

      fn item_3(vertexIndex: u32, time: f32) -> LineSegmentVertex_4 {
        let s = sin(time);
        let c = cos(time);
        const r = 0.25;
        var points = array<vec2f, 4>(vec2f(((r * s) - 0.25f), (r * c)), vec2f(-0.25, 0), vec2f(0.25, 0), vec2f(((-(r) * s) + 0.25f), (r * c)));
        let i = clamp((i32(vertexIndex) - 1i), 0i, 3i);
        return LineSegmentVertex_4(points[i], 0.2f);
      }

      struct mainVertex_Output_5 {
        @builtin(position) outPos: vec4f,
        @location(0) position: vec2f,
        @location(1) uv: vec2f,
        @location(2) @interpolate(flat) instanceIndex: u32,
        @location(3) @interpolate(flat) vertexIndex: u32,
        @location(4) @interpolate(flat) situationIndex: u32,
      }

      struct JoinPath_8 {
        joinIndex: u32,
        path: u32,
        depth: i32,
      }

      fn getJoinParent_9(i: u32) -> u32 {
        return ((i - 4u) >> 1u);
      }

      fn getJoinVertexPath_7(vertexIndex: u32) -> JoinPath_8 {
        var lookup = array<u32, 10>(0u, 0u, 0u, 1u, 1u, 2u, 2u, 2u, 3u, 3u);
        if ((vertexIndex < 10u)) {
          return JoinPath_8(lookup[vertexIndex], 0u, -1i);
        }
        var joinIndex = (vertexIndex - 10u);
        var depth = 0;
        var path = 0u;
        while ((joinIndex >= 4u)) {
          path = ((path << 1u) | (joinIndex & 1u));
          joinIndex = getJoinParent_9(joinIndex);
          depth += 1i;
        }
        return JoinPath_8(joinIndex, path, depth);
      }

      struct LineSegmentOutput_10 {
        vertexPosition: vec2f,
        situationIndex: u32,
      }

      struct ExternalNormals_12 {
        n1: vec2f,
        n2: vec2f,
      }

      fn externalNormals_11(distance: vec2f, r1: f32, r2: f32) -> ExternalNormals_12 {
        var dNorm = normalize(distance);
        let expCos = ((r1 - r2) / length(distance));
        let expSin = sqrt(max(0f, (1f - (expCos * expCos))));
        let a = (dNorm.x * expCos);
        let b = (dNorm.y * expSin);
        let c = (dNorm.x * expSin);
        let d = (dNorm.y * expCos);
        var n1 = vec2f((a - b), (c + d));
        var n2 = vec2f((a + b), (-(c) + d));
        return ExternalNormals_12(n1, n2);
      }

      fn cross2d_14(a: vec2f, b: vec2f) -> f32 {
        return ((a.x * b.y) - (a.y * b.x));
      }

      fn isCCW_15(aX: f32, aYSign: bool, bX: f32, bYSign: bool) -> bool {
        let sameSide = (aYSign == bYSign);
        return select(aYSign, (aYSign == (aX >= bX)), sameSide);
      }

      const lookup_17: array<u32, 8> = array<u32, 8>(5u, 3u, 4u, 3u, 2u, 1u, 0u, 0u);

      fn rank3_16(aGb: bool, bGc: bool, aGc: bool) -> u32 {
        let code = (((u32(aGb) << 2u) | (u32(bGc) << 1u)) | u32(aGc));
        return lookup_17[code];
      }

      fn joinSituationIndex_13(ul: vec2f, ur: vec2f, dl: vec2f, dr: vec2f) -> u32 {
        let crossUL = cross2d_14(ur, ul);
        let crossDL = cross2d_14(ur, dl);
        let crossDR = cross2d_14(ur, dr);
        let signUL = (crossUL >= 0f);
        let signDL = (crossDL >= 0f);
        let signDR = (crossDR >= 0f);
        let dotUL = dot(ur, ul);
        let dotDL = dot(ur, dl);
        let dotDR = dot(ur, dr);
        return rank3_16(isCCW_15(dotUL, signUL, dotDL, signDL), isCCW_15(dotDL, signDL, dotDR, signDR), isCCW_15(dotUL, signUL, dotDR, signDR));
      }

      const JOIN_LIMIT_18: f32 = 0.999f;

      fn rot90ccw_21(v: vec2f) -> vec2f {
        return vec2f(-(v.y), v.x);
      }

      fn rot90cw_22(v: vec2f) -> vec2f {
        return vec2f(v.y, -(v.x));
      }

      fn bisectCcw_20(a: vec2f, b: vec2f) -> vec2f {
        let sin = cross2d_14(a, b);
        let sinSign = select(-1f, 1f, (sin >= 0f));
        var orthoA = rot90ccw_21(a);
        var orthoB = rot90cw_22(b);
        var dir = select(((a + b) * sinSign), (orthoA + orthoB), (dot(a, b) < 0f));
        return normalize(dir);
      }

      fn midPoint_23(a: vec2f, b: vec2f) -> vec2f {
        return (0.5 * (a + b));
      }

      fn addMul_24(a: vec2f, b: vec2f, f: f32) -> vec2f {
        return (a + (b * f));
      }

      fn miterPoint_19(a: vec2f, b: vec2f) -> vec2f {
        let sin_ = cross2d_14(a, b);
        var bisection = bisectCcw_20(a, b);
        let b2 = dot(b, b);
        let cos_ = dot(a, b);
        let diff = (b2 - cos_);
        if (((diff * diff) < 1e-4f)) {
          return midPoint_23(a, b);
        }
        if ((sin_ < 0f)) {
          return (bisection * -1000000);
        }
        let t = (diff / sin_);
        return addMul_24(a, rot90ccw_21(a), t);
      }

      struct LimitAlongResult_26 {
        a: vec2f,
        b: vec2f,
        limitWasHit: bool,
      }

      fn limitTowardsMiddle_25(middle: vec2f, dir: vec2f, p1: vec2f, p2: vec2f) -> LimitAlongResult_26 {
        let t1 = dot((p1 - middle), dir);
        let t2 = dot((p2 - middle), dir);
        if ((t1 <= t2)) {
          return LimitAlongResult_26(p1, p2, false);
        }
        let t = clamp((t1 / (t1 - t2)), 0f, 1f);
        var p = mix(p1, p2, t);
        return LimitAlongResult_26(p, p, true);
      }

      fn bisectNoCheck_28(a: vec2f, b: vec2f) -> vec2f {
        return normalize((a + b));
      }

      fn item_27(vertexIndex: u32, joinPath: JoinPath_8, V: LineSegmentVertex_4, vu: vec2f, vd: vec2f, right: vec2f, dir: vec2f, left: vec2f) -> vec2f {
        var uR = right;
        var u = dir;
        var c = dir;
        var d = dir;
        var dR = left;
        let joinIndex = joinPath.joinIndex;
        if ((joinPath.depth >= 0i)) {
          var parents = array<vec2f, 4>(uR, u, d, dR);
          var d0 = parents[((joinIndex * 2u) & 3u)];
          var d1 = parents[(((joinIndex * 2u) + 1u) & 3u)];
          var dm = bisectCcw_20(d0, d1);
          var path = joinPath.path;
          for (var depth = joinPath.depth; (depth > 0i); depth -= 1i) {
            let isLeftChild = ((path & 1u) == 0u);
            d0 = select(dm, d0, isLeftChild);
            d1 = select(d1, dm, isLeftChild);
            dm = bisectNoCheck_28(d0, d1);
            path >>= 1u;
          }
          return addMul_24(V.position, dm, V.radius);
        }
        var v1 = addMul_24(V.position, u, V.radius);
        var v2 = addMul_24(V.position, c, V.radius);
        var v3 = addMul_24(V.position, d, V.radius);
        var points = array<vec2f, 5>(vu, v1, v2, v3, vd);
        return points[(vertexIndex % 5u)];
      }

      struct Intersection_31 {
        valid: bool,
        t: f32,
        point: vec2f,
      }

      fn intersectLines_30(A1: vec2f, A2: vec2f, B1: vec2f, B2: vec2f) -> Intersection_31 {
        var a = (A2 - A1);
        var b = (B2 - B1);
        let axb = cross2d_14(a, b);
        var AB = (B1 - A1);
        let t = (cross2d_14(AB, b) / axb);
        return Intersection_31((axb != 0f), t, addMul_24(A1, a, t));
      }

      fn item_29(situationIndex: u32, vertexIndex: u32, joinPath: JoinPath_8, V: LineSegmentVertex_4, vu: vec2f, vd: vec2f, ul: vec2f, ur: vec2f, dl: vec2f, dr: vec2f, joinU: bool, joinD: bool) -> vec2f {
        var midU = bisectCcw_20(ur, ul);
        var midD = bisectCcw_20(dl, dr);
        var midR = bisectCcw_20(ur, dr);
        var midL = bisectCcw_20(dl, ul);
        let shouldCross = ((situationIndex == 1u) || (situationIndex == 4u));
        var crossCenter = intersectLines_30(ul, dl, ur, dr).point;
        var averageCenter = (((ur + ul) + (dl + dr)) * 0.25);
        var uR = ur;
        var u = midU;
        var c = select(averageCenter, crossCenter, shouldCross);
        var d = midD;
        var dR = dr;
        if ((situationIndex == 2u)) {
          uR = ur;
          u = midR;
          c = midR;
          d = midR;
          dR = dr;
        }
        if ((situationIndex == 3u)) {
          uR = ur;
          u = midL;
          c = midL;
          d = midL;
          dR = dr;
        }
        let joinIndex = joinPath.joinIndex;
        if ((joinPath.depth >= 0i)) {
          var parents = array<vec2f, 4>(uR, u, d, dR);
          var d0 = parents[((joinIndex * 2u) & 3u)];
          var d1 = parents[(((joinIndex * 2u) + 1u) & 3u)];
          var dm = bisectCcw_20(d0, d1);
          var path = joinPath.path;
          for (var depth = joinPath.depth; (depth > 0i); depth -= 1i) {
            let isLeftChild = ((path & 1u) == 0u);
            d0 = select(dm, d0, isLeftChild);
            d1 = select(d1, dm, isLeftChild);
            dm = bisectNoCheck_28(d0, d1);
            path >>= 1u;
          }
          return addMul_24(V.position, dm, V.radius);
        }
        var v1 = select(vu, addMul_24(V.position, u, V.radius), joinU);
        var v2 = select(vu, addMul_24(V.position, c, V.radius), (joinU || joinD));
        var v3 = select(vd, addMul_24(V.position, d, V.radius), joinD);
        var points = array<vec2f, 5>(vu, v1, v2, v3, vd);
        return points[(vertexIndex % 5u)];
      }

      fn lineSegmentVariableWidth_6(vertexIndex: u32, A: LineSegmentVertex_4, B: LineSegmentVertex_4, C: LineSegmentVertex_4, D: LineSegmentVertex_4) -> LineSegmentOutput_10 {
        var joinPath = getJoinVertexPath_7(vertexIndex);
        var AB = (B.position - A.position);
        var BC = (C.position - B.position);
        var CD = (D.position - C.position);
        let radiusABDelta = (A.radius - B.radius);
        let radiusBCDelta = (B.radius - C.radius);
        let radiusCDDelta = (C.radius - D.radius);
        if ((dot(BC, BC) <= (radiusBCDelta * radiusBCDelta))) {
          return LineSegmentOutput_10(vec2f(), 0u);
        }
        let isCapB = (dot(AB, AB) <= ((radiusABDelta * radiusABDelta) + 1e-12f));
        let isCapC = (dot(CD, CD) <= ((radiusCDDelta * radiusCDDelta) + 1e-12f));
        var eAB = externalNormals_11(AB, A.radius, B.radius);
        var eBC = externalNormals_11(BC, B.radius, C.radius);
        var eCD = externalNormals_11(CD, C.radius, D.radius);
        var nBC = normalize(BC);
        var nCB = (nBC * -1);
        var d0 = eBC.n1;
        var d4 = eBC.n2;
        var d5 = eBC.n2;
        var d9 = eBC.n1;
        let situationIndexB = joinSituationIndex_13(eAB.n1, eBC.n1, eAB.n2, eBC.n2);
        let situationIndexC = joinSituationIndex_13(eCD.n2, eBC.n2, eCD.n1, eBC.n1);
        var joinBu = true;
        var joinBd = true;
        var joinCu = true;
        var joinCd = true;
        if (!isCapB) {
          if ((((situationIndexB == 1u) || (situationIndexB == 5u)) || (dot(eBC.n2, eAB.n2) > JOIN_LIMIT_18))) {
            d4 = miterPoint_19(eBC.n2, eAB.n2);
            joinBd = false;
          }
          if ((((situationIndexB == 4u) || (situationIndexB == 5u)) || (dot(eAB.n1, eBC.n1) > JOIN_LIMIT_18))) {
            d0 = miterPoint_19(eAB.n1, eBC.n1);
            joinBu = false;
          }
        }
        if (!isCapC) {
          if ((((situationIndexC == 4u) || (situationIndexC == 5u)) || (dot(eCD.n2, eBC.n2) > JOIN_LIMIT_18))) {
            d5 = miterPoint_19(eCD.n2, eBC.n2);
            joinCd = false;
          }
          if ((((situationIndexC == 1u) || (situationIndexC == 5u)) || (dot(eBC.n1, eCD.n1) > JOIN_LIMIT_18))) {
            d9 = miterPoint_19(eBC.n1, eCD.n1);
            joinCu = false;
          }
        }
        var v0 = addMul_24(B.position, d0, B.radius);
        var v4 = addMul_24(B.position, d4, B.radius);
        var v5 = addMul_24(C.position, d5, C.radius);
        var v9 = addMul_24(C.position, d9, C.radius);
        var midBC = midPoint_23(B.position, C.position);
        var tBC1 = rot90cw_22(eBC.n1);
        var tBC2 = rot90ccw_21(eBC.n2);
        var limU = limitTowardsMiddle_25(midBC, tBC1, v0, v9);
        var limD = limitTowardsMiddle_25(midBC, tBC2, v4, v5);
        v0 = limU.a;
        v9 = limU.b;
        v4 = limD.a;
        v5 = limD.b;
        let isCSide = (joinPath.joinIndex >= 2u);
        var situationIndex = situationIndexB;
        var V = B;
        var isCap = isCapB;
        var j1 = eAB.n1;
        var j2 = eBC.n1;
        var j3 = eAB.n2;
        var j4 = eBC.n2;
        var vu = v0;
        var vd = v4;
        var joinU = joinBu;
        var joinD = joinBd;
        if (isCSide) {
          situationIndex = situationIndexC;
          V = C;
          isCap = isCapC;
          j4 = eBC.n1;
          j3 = eCD.n1;
          j2 = eBC.n2;
          j1 = eCD.n2;
          vu = v5;
          vd = v9;
          joinU = joinCd;
          joinD = joinCu;
        }
        let joinIndex = joinPath.joinIndex;
        if ((vertexIndex >= 10u)) {
          var shouldJoin = array<u32, 4>(u32(joinBu), u32(joinBd), u32(joinCd), u32(joinCu));
          if ((shouldJoin[joinIndex] == 0u)) {
            var noJoinPoints = array<vec2f, 4>(v0, v4, v5, v9);
            let vertexPosition2 = (&noJoinPoints[joinIndex]);
            return LineSegmentOutput_10((*vertexPosition2), situationIndex);
          }
        }
        var vertexPosition = vec2f();
        if (isCap) {
          if (isCSide) {
            vertexPosition = item_27(vertexIndex, joinPath, V, vu, vd, j2, nBC, j4);
          }
          else {
            vertexPosition = item_27(vertexIndex, joinPath, V, vu, vd, j2, nCB, j4);
          }
        }
        else {
          vertexPosition = item_29(situationIndex, vertexIndex, joinPath, V, vu, vd, j1, j2, j3, j4, joinU, joinD);
        }
        return LineSegmentOutput_10(vertexPosition, situationIndex);
      }

      fn uvToLineSegment_32(A: vec2f, B: vec2f, point: vec2f) -> vec2f {
        var p = (point - A);
        var AB = (B - A);
        let x = (dot(p, AB) / dot(AB, AB));
        let y = cross2d_14(normalize(AB), p);
        return vec2f(x, y);
      }

      struct mainVertex_Input_33 {
        @builtin(instance_index) instanceIndex: u32,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex_0(_arg_0: mainVertex_Input_33) -> mainVertex_Output_5 {
        let t = uniforms_1.time;
        var A = item_3(_arg_0.instanceIndex, t);
        var B = item_3((_arg_0.instanceIndex + 1u), t);
        var C = item_3((_arg_0.instanceIndex + 2u), t);
        var D = item_3((_arg_0.instanceIndex + 3u), t);
        if (((((A.radius < 0f) || (B.radius < 0f)) || (C.radius < 0f)) || (D.radius < 0f))) {
          return mainVertex_Output_5(vec4f(), vec2f(), vec2f(), 0u, 0u, 0u);
        }
        var result = lineSegmentVariableWidth_6(_arg_0.vertexIndex, A, B, C, D);
        var uv = uvToLineSegment_32(B.position, C.position, result.vertexPosition);
        return mainVertex_Output_5(vec4f(result.vertexPosition, 0f, 1f), result.vertexPosition, uv, _arg_0.instanceIndex, _arg_0.vertexIndex, result.situationIndex);
      }

      struct outlineFragment_Input_35 {
        @builtin(front_facing) _unused: bool,
      }

      @fragment fn outlineFragment_34(_arg_0: outlineFragment_Input_35) -> @location(0) vec4f {
        return vec4f(0, 0, 0, 0.20000000298023224);
      }

      struct Uniforms_2 {
        time: f32,
        fillType: u32,
      }

      @group(0) @binding(0) var<uniform> uniforms_1: Uniforms_2;

      struct LineSegmentVertex_4 {
        position: vec2f,
        radius: f32,
      }

      fn item_3(vertexIndex: u32, time: f32) -> LineSegmentVertex_4 {
        let i = ((f32(vertexIndex) % 2000f) / 2000f);
        let x = cos(((25.132741228718345f * i) + 1.5707963267948966f));
        let y = cos((31.41592653589793f * i));
        return LineSegmentVertex_4(vec2f((0.8f * x), (0.8f * y)), (0.05f * clamp(sin(((25.132741228718345f * i) - (3f * time))), 0.1f, 1f)));
      }

      struct mainVertex_Output_5 {
        @builtin(position) outPos: vec4f,
        @location(0) position: vec2f,
        @location(1) uv: vec2f,
        @location(2) @interpolate(flat) instanceIndex: u32,
        @location(3) @interpolate(flat) vertexIndex: u32,
        @location(4) @interpolate(flat) situationIndex: u32,
      }

      struct JoinPath_8 {
        joinIndex: u32,
        path: u32,
        depth: i32,
      }

      fn getJoinParent_9(i: u32) -> u32 {
        return ((i - 4u) >> 1u);
      }

      fn getJoinVertexPath_7(vertexIndex: u32) -> JoinPath_8 {
        var lookup = array<u32, 10>(0u, 0u, 0u, 1u, 1u, 2u, 2u, 2u, 3u, 3u);
        if ((vertexIndex < 10u)) {
          return JoinPath_8(lookup[vertexIndex], 0u, -1i);
        }
        var joinIndex = (vertexIndex - 10u);
        var depth = 0;
        var path = 0u;
        while ((joinIndex >= 4u)) {
          path = ((path << 1u) | (joinIndex & 1u));
          joinIndex = getJoinParent_9(joinIndex);
          depth += 1i;
        }
        return JoinPath_8(joinIndex, path, depth);
      }

      struct LineSegmentOutput_10 {
        vertexPosition: vec2f,
        situationIndex: u32,
      }

      struct ExternalNormals_12 {
        n1: vec2f,
        n2: vec2f,
      }

      fn externalNormals_11(distance: vec2f, r1: f32, r2: f32) -> ExternalNormals_12 {
        var dNorm = normalize(distance);
        let expCos = ((r1 - r2) / length(distance));
        let expSin = sqrt(max(0f, (1f - (expCos * expCos))));
        let a = (dNorm.x * expCos);
        let b = (dNorm.y * expSin);
        let c = (dNorm.x * expSin);
        let d = (dNorm.y * expCos);
        var n1 = vec2f((a - b), (c + d));
        var n2 = vec2f((a + b), (-(c) + d));
        return ExternalNormals_12(n1, n2);
      }

      fn cross2d_14(a: vec2f, b: vec2f) -> f32 {
        return ((a.x * b.y) - (a.y * b.x));
      }

      fn isCCW_15(aX: f32, aYSign: bool, bX: f32, bYSign: bool) -> bool {
        let sameSide = (aYSign == bYSign);
        return select(aYSign, (aYSign == (aX >= bX)), sameSide);
      }

      const lookup_17: array<u32, 8> = array<u32, 8>(5u, 3u, 4u, 3u, 2u, 1u, 0u, 0u);

      fn rank3_16(aGb: bool, bGc: bool, aGc: bool) -> u32 {
        let code = (((u32(aGb) << 2u) | (u32(bGc) << 1u)) | u32(aGc));
        return lookup_17[code];
      }

      fn joinSituationIndex_13(ul: vec2f, ur: vec2f, dl: vec2f, dr: vec2f) -> u32 {
        let crossUL = cross2d_14(ur, ul);
        let crossDL = cross2d_14(ur, dl);
        let crossDR = cross2d_14(ur, dr);
        let signUL = (crossUL >= 0f);
        let signDL = (crossDL >= 0f);
        let signDR = (crossDR >= 0f);
        let dotUL = dot(ur, ul);
        let dotDL = dot(ur, dl);
        let dotDR = dot(ur, dr);
        return rank3_16(isCCW_15(dotUL, signUL, dotDL, signDL), isCCW_15(dotDL, signDL, dotDR, signDR), isCCW_15(dotUL, signUL, dotDR, signDR));
      }

      const JOIN_LIMIT_18: f32 = 0.999f;

      fn rot90ccw_21(v: vec2f) -> vec2f {
        return vec2f(-(v.y), v.x);
      }

      fn rot90cw_22(v: vec2f) -> vec2f {
        return vec2f(v.y, -(v.x));
      }

      fn bisectCcw_20(a: vec2f, b: vec2f) -> vec2f {
        let sin = cross2d_14(a, b);
        let sinSign = select(-1f, 1f, (sin >= 0f));
        var orthoA = rot90ccw_21(a);
        var orthoB = rot90cw_22(b);
        var dir = select(((a + b) * sinSign), (orthoA + orthoB), (dot(a, b) < 0f));
        return normalize(dir);
      }

      fn midPoint_23(a: vec2f, b: vec2f) -> vec2f {
        return (0.5 * (a + b));
      }

      fn addMul_24(a: vec2f, b: vec2f, f: f32) -> vec2f {
        return (a + (b * f));
      }

      fn miterPoint_19(a: vec2f, b: vec2f) -> vec2f {
        let sin_ = cross2d_14(a, b);
        var bisection = bisectCcw_20(a, b);
        let b2 = dot(b, b);
        let cos_ = dot(a, b);
        let diff = (b2 - cos_);
        if (((diff * diff) < 1e-4f)) {
          return midPoint_23(a, b);
        }
        if ((sin_ < 0f)) {
          return (bisection * -1000000);
        }
        let t = (diff / sin_);
        return addMul_24(a, rot90ccw_21(a), t);
      }

      struct LimitAlongResult_26 {
        a: vec2f,
        b: vec2f,
        limitWasHit: bool,
      }

      fn limitTowardsMiddle_25(middle: vec2f, dir: vec2f, p1: vec2f, p2: vec2f) -> LimitAlongResult_26 {
        let t1 = dot((p1 - middle), dir);
        let t2 = dot((p2 - middle), dir);
        if ((t1 <= t2)) {
          return LimitAlongResult_26(p1, p2, false);
        }
        let t = clamp((t1 / (t1 - t2)), 0f, 1f);
        var p = mix(p1, p2, t);
        return LimitAlongResult_26(p, p, true);
      }

      fn item_27(vertexIndex: u32, joinPath: JoinPath_8, V: LineSegmentVertex_4, vu: vec2f, vd: vec2f, right: vec2f, dir: vec2f, left: vec2f) -> vec2f {
        if ((joinPath.depth >= 0i)) {
          var remove = array<vec2f, 2>(right, left);
          var dm = remove[(joinPath.joinIndex & 1u)];
          return addMul_24(V.position, dm, V.radius);
        }
        var v1 = addMul_24(V.position, right, V.radius);
        var v2 = addMul_24(V.position, dir, V.radius);
        var v3 = addMul_24(V.position, left, V.radius);
        var points = array<vec2f, 5>(vu, v1, v2, v3, vd);
        return points[(vertexIndex % 5u)];
      }

      fn intersectTangent_29(a: vec2f, n: vec2f) -> vec2f {
        let cos_ = dot(a, n);
        return (n * (1f / cos_));
      }

      fn miterPointNoCheck_30(a: vec2f, b: vec2f) -> vec2f {
        var ab = (a + b);
        return (ab * (2f / dot(ab, ab)));
      }

      fn item_28(vertexIndex: u32, joinPath: JoinPath_8, V: LineSegmentVertex_4, vu: vec2f, vd: vec2f, right: vec2f, dir: vec2f, left: vec2f) -> vec2f {
        let shouldJoin = (dot(dir, right) < 0f);
        var dirRight = rot90cw_22(dir);
        var dirLeft = rot90ccw_21(dir);
        var u = select(intersectTangent_29(right, dirRight), dirRight, shouldJoin);
        var c = vec2f();
        var d = select(intersectTangent_29(left, dirLeft), dirLeft, shouldJoin);
        let joinIndex = joinPath.joinIndex;
        if ((joinPath.depth >= 0i)) {
          var miterR = select(u, miterPointNoCheck_30(right, dirRight), shouldJoin);
          var miterL = select(d, miterPointNoCheck_30(dirLeft, left), shouldJoin);
          var parents = array<vec2f, 2>(miterR, miterL);
          let dm = (&parents[(joinIndex & 1u)]);
          return addMul_24(V.position, (*dm), V.radius);
        }
        var v1 = addMul_24(V.position, u, V.radius);
        var v0 = select(v1, vu, shouldJoin);
        var v2 = addMul_24(V.position, c, V.radius);
        var v3 = addMul_24(V.position, d, V.radius);
        var v4 = select(v3, vd, shouldJoin);
        var points = array<vec2f, 5>(v0, v1, v2, v3, v4);
        return points[(vertexIndex % 5u)];
      }

      fn miterLimit_32(miter: vec2f, limitRatio: f32) -> vec2f {
        let m2 = dot(miter, miter);
        if ((m2 > (limitRatio * limitRatio))) {
          return (normalize(miter) * ((((limitRatio - 1f) * ((limitRatio * limitRatio) - 1f)) / (m2 - 1f)) + 1f));
        }
        return miter;
      }

      struct Intersection_34 {
        valid: bool,
        t: f32,
        point: vec2f,
      }

      fn intersectLines_33(A1: vec2f, A2: vec2f, B1: vec2f, B2: vec2f) -> Intersection_34 {
        var a = (A2 - A1);
        var b = (B2 - B1);
        let axb = cross2d_14(a, b);
        var AB = (B1 - A1);
        let t = (cross2d_14(AB, b) / axb);
        return Intersection_34((axb != 0f), t, addMul_24(A1, a, t));
      }

      fn item_31(situationIndex: u32, vertexIndex: u32, joinPath: JoinPath_8, V: LineSegmentVertex_4, vu: vec2f, vd: vec2f, ul: vec2f, ur: vec2f, dl: vec2f, dr: vec2f, joinU: bool, joinD: bool) -> vec2f {
        var miterU = miterPoint_19(ur, ul);
        var miterD = miterPoint_19(dl, dr);
        miterU = miterLimit_32(miterU, 2f);
        miterD = miterLimit_32(miterD, 2f);
        let shouldCross = ((situationIndex == 1u) || (situationIndex == 4u));
        var crossCenter = intersectLines_33(ul, dl, ur, dr).point;
        var averageCenter = ((normalize(miterU) + normalize(miterD)) * 0.5);
        var uR = ur;
        var u = miterU;
        var c = select(averageCenter, crossCenter, shouldCross);
        var d = miterD;
        var dR = dr;
        if ((situationIndex == 2u)) {
          var mid = bisectCcw_20(ur, dr);
          uR = ur;
          u = mid;
          c = mid;
          d = mid;
          dR = dr;
        }
        if ((situationIndex == 3u)) {
          var mid = bisectCcw_20(dl, ul);
          uR = ur;
          u = mid;
          c = mid;
          d = mid;
          dR = dr;
        }
        let joinIndex = joinPath.joinIndex;
        if ((joinPath.depth >= 0i)) {
          var parents = array<vec2f, 4>(uR, u, d, dR);
          var d0 = parents[((joinIndex * 2u) & 3u)];
          var d1 = parents[(((joinIndex * 2u) + 1u) & 3u)];
          var dm = miterPoint_19(d0, d1);
          return addMul_24(V.position, dm, V.radius);
        }
        var v1 = select(vu, addMul_24(V.position, u, V.radius), joinU);
        var v2 = select(vu, addMul_24(V.position, c, V.radius), (joinU || joinD));
        var v3 = select(vd, addMul_24(V.position, d, V.radius), joinD);
        var points = array<vec2f, 5>(vu, v1, v2, v3, vd);
        return points[(vertexIndex % 5u)];
      }

      fn lineSegmentVariableWidth_6(vertexIndex: u32, A: LineSegmentVertex_4, B: LineSegmentVertex_4, C: LineSegmentVertex_4, D: LineSegmentVertex_4) -> LineSegmentOutput_10 {
        var joinPath = getJoinVertexPath_7(vertexIndex);
        var AB = (B.position - A.position);
        var BC = (C.position - B.position);
        var CD = (D.position - C.position);
        let radiusABDelta = (A.radius - B.radius);
        let radiusBCDelta = (B.radius - C.radius);
        let radiusCDDelta = (C.radius - D.radius);
        if ((dot(BC, BC) <= (radiusBCDelta * radiusBCDelta))) {
          return LineSegmentOutput_10(vec2f(), 0u);
        }
        let isCapB = (dot(AB, AB) <= ((radiusABDelta * radiusABDelta) + 1e-12f));
        let isCapC = (dot(CD, CD) <= ((radiusCDDelta * radiusCDDelta) + 1e-12f));
        var eAB = externalNormals_11(AB, A.radius, B.radius);
        var eBC = externalNormals_11(BC, B.radius, C.radius);
        var eCD = externalNormals_11(CD, C.radius, D.radius);
        var nBC = normalize(BC);
        var nCB = (nBC * -1);
        var d0 = eBC.n1;
        var d4 = eBC.n2;
        var d5 = eBC.n2;
        var d9 = eBC.n1;
        let situationIndexB = joinSituationIndex_13(eAB.n1, eBC.n1, eAB.n2, eBC.n2);
        let situationIndexC = joinSituationIndex_13(eCD.n2, eBC.n2, eCD.n1, eBC.n1);
        var joinBu = true;
        var joinBd = true;
        var joinCu = true;
        var joinCd = true;
        if (!isCapB) {
          if ((((situationIndexB == 1u) || (situationIndexB == 5u)) || (dot(eBC.n2, eAB.n2) > JOIN_LIMIT_18))) {
            d4 = miterPoint_19(eBC.n2, eAB.n2);
            joinBd = false;
          }
          if ((((situationIndexB == 4u) || (situationIndexB == 5u)) || (dot(eAB.n1, eBC.n1) > JOIN_LIMIT_18))) {
            d0 = miterPoint_19(eAB.n1, eBC.n1);
            joinBu = false;
          }
        }
        if (!isCapC) {
          if ((((situationIndexC == 4u) || (situationIndexC == 5u)) || (dot(eCD.n2, eBC.n2) > JOIN_LIMIT_18))) {
            d5 = miterPoint_19(eCD.n2, eBC.n2);
            joinCd = false;
          }
          if ((((situationIndexC == 1u) || (situationIndexC == 5u)) || (dot(eBC.n1, eCD.n1) > JOIN_LIMIT_18))) {
            d9 = miterPoint_19(eBC.n1, eCD.n1);
            joinCu = false;
          }
        }
        var v0 = addMul_24(B.position, d0, B.radius);
        var v4 = addMul_24(B.position, d4, B.radius);
        var v5 = addMul_24(C.position, d5, C.radius);
        var v9 = addMul_24(C.position, d9, C.radius);
        var midBC = midPoint_23(B.position, C.position);
        var tBC1 = rot90cw_22(eBC.n1);
        var tBC2 = rot90ccw_21(eBC.n2);
        var limU = limitTowardsMiddle_25(midBC, tBC1, v0, v9);
        var limD = limitTowardsMiddle_25(midBC, tBC2, v4, v5);
        v0 = limU.a;
        v9 = limU.b;
        v4 = limD.a;
        v5 = limD.b;
        let isCSide = (joinPath.joinIndex >= 2u);
        var situationIndex = situationIndexB;
        var V = B;
        var isCap = isCapB;
        var j1 = eAB.n1;
        var j2 = eBC.n1;
        var j3 = eAB.n2;
        var j4 = eBC.n2;
        var vu = v0;
        var vd = v4;
        var joinU = joinBu;
        var joinD = joinBd;
        if (isCSide) {
          situationIndex = situationIndexC;
          V = C;
          isCap = isCapC;
          j4 = eBC.n1;
          j3 = eCD.n1;
          j2 = eBC.n2;
          j1 = eCD.n2;
          vu = v5;
          vd = v9;
          joinU = joinCd;
          joinD = joinCu;
        }
        let joinIndex = joinPath.joinIndex;
        if ((vertexIndex >= 10u)) {
          var shouldJoin = array<u32, 4>(u32(joinBu), u32(joinBd), u32(joinCd), u32(joinCu));
          if ((shouldJoin[joinIndex] == 0u)) {
            var noJoinPoints = array<vec2f, 4>(v0, v4, v5, v9);
            let vertexPosition2 = (&noJoinPoints[joinIndex]);
            return LineSegmentOutput_10((*vertexPosition2), situationIndex);
          }
        }
        var vertexPosition = vec2f();
        if (isCap) {
          if (isCSide) {
            vertexPosition = item_27(vertexIndex, joinPath, V, vu, vd, j2, nBC, j4);
          }
          else {
            vertexPosition = item_28(vertexIndex, joinPath, V, vu, vd, j2, nCB, j4);
          }
        }
        else {
          vertexPosition = item_31(situationIndex, vertexIndex, joinPath, V, vu, vd, j1, j2, j3, j4, joinU, joinD);
        }
        return LineSegmentOutput_10(vertexPosition, situationIndex);
      }

      fn uvToLineSegment_35(A: vec2f, B: vec2f, point: vec2f) -> vec2f {
        var p = (point - A);
        var AB = (B - A);
        let x = (dot(p, AB) / dot(AB, AB));
        let y = cross2d_14(normalize(AB), p);
        return vec2f(x, y);
      }

      struct mainVertex_Input_36 {
        @builtin(instance_index) instanceIndex: u32,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex_0(_arg_0: mainVertex_Input_36) -> mainVertex_Output_5 {
        let t = uniforms_1.time;
        var A = item_3(_arg_0.instanceIndex, t);
        var B = item_3((_arg_0.instanceIndex + 1u), t);
        var C = item_3((_arg_0.instanceIndex + 2u), t);
        var D = item_3((_arg_0.instanceIndex + 3u), t);
        if (((((A.radius < 0f) || (B.radius < 0f)) || (C.radius < 0f)) || (D.radius < 0f))) {
          return mainVertex_Output_5(vec4f(), vec2f(), vec2f(), 0u, 0u, 0u);
        }
        var result = lineSegmentVariableWidth_6(_arg_0.vertexIndex, A, B, C, D);
        var uv = uvToLineSegment_35(B.position, C.position, result.vertexPosition);
        return mainVertex_Output_5(vec4f(result.vertexPosition, 0f, 1f), result.vertexPosition, uv, _arg_0.instanceIndex, _arg_0.vertexIndex, result.situationIndex);
      }

      struct mainFragment_Input_38 {
        @location(2) @interpolate(flat) instanceIndex: u32,
        @location(3) @interpolate(flat) vertexIndex: u32,
        @location(4) @interpolate(flat) situationIndex: u32,
        @builtin(front_facing) frontFacing: bool,
        @builtin(position) screenPosition: vec4f,
        @location(0) position: vec2f,
        @location(1) uv: vec2f,
      }

      @fragment fn mainFragment_37(_arg_0: mainFragment_Input_38) -> @location(0) vec4f {
        let fillType2 = uniforms_1.fillType;
        if ((fillType2 == 1u)) {
          return mix(vec4f(0.7699999809265137, 0.38999998569488525, 1, 0.5), vec4f(0.10999999940395355, 0.4399999976158142, 0.9399999976158142, 0.5), ((_arg_0.position.x * 0.5f) + 0.5f));
        }
        var color = vec3f();
        var colors = array<vec3f, 9>(vec3f(1, 0, 0), vec3f(0, 1, 0), vec3f(0, 0, 1), vec3f(1, 0, 1), vec3f(1, 1, 0), vec3f(0, 1, 1), vec3f(0.75, 0.25, 0.25), vec3f(0.25, 0.75, 0.25), vec3f(0.25, 0.25, 0.75));
        if ((fillType2 == 2u)) {
          color = colors[(_arg_0.instanceIndex % 9u)];
        }
        if ((fillType2 == 3u)) {
          color = colors[(_arg_0.vertexIndex % 9u)];
        }
        if ((fillType2 == 4u)) {
          color = colors[(_arg_0.situationIndex % 9u)];
        }
        if ((fillType2 == 5u)) {
          color = vec3f(_arg_0.uv.x, cos((_arg_0.uv.y * 100f)), 0f);
        }
        if (_arg_0.frontFacing) {
          return vec4f(color, 0.5f);
        }
        return vec4f(color, select(0f, 1f, (((u32(_arg_0.screenPosition.x) >> 3u) % 2u) != ((u32(_arg_0.screenPosition.y) >> 3u) % 2u))));
      }

      struct outlineFragment_Input_40 {
        @builtin(front_facing) _unused: bool,
      }

      @fragment fn outlineFragment_39(_arg_0: outlineFragment_Input_40) -> @location(0) vec4f {
        return vec4f(0, 0, 0, 0.20000000298023224);
      }

      struct centerlineVertex_Output_42 {
        @builtin(position) outPos: vec4f,
      }

      struct centerlineVertex_Input_43 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn centerlineVertex_41(_arg_0: centerlineVertex_Input_43) -> centerlineVertex_Output_42 {
        let t = uniforms_1.time;
        var vertex = item_3(_arg_0.vertexIndex, t);
        if ((vertex.radius < 0f)) {
          return centerlineVertex_Output_42(vec4f());
        }
        return centerlineVertex_Output_42(vec4f(vertex.position, 0f, 1f));
      }

      struct circlesVertex_Output_45 {
        @builtin(position) outPos: vec4f,
      }

      struct circlesVertex_Input_46 {
        @builtin(instance_index) instanceIndex: u32,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn circlesVertex_44(_arg_0: circlesVertex_Input_46) -> circlesVertex_Output_45 {
        let t = uniforms_1.time;
        var vertex = item_3(_arg_0.instanceIndex, t);
        if ((vertex.radius < 0f)) {
          return circlesVertex_Output_45(vec4f());
        }
        let step = clamp((0.007853981633974483f / vertex.radius), 0.02454369260617026f, 0.39269908169872414f);
        let angle = min(6.283185307179586f, (step * f32(_arg_0.vertexIndex)));
        var unit = vec2f(cos(angle), sin(angle));
        return circlesVertex_Output_45(vec4f(addMul_24(vertex.position, unit, vertex.radius), 0f, 1f));
      }

      struct Uniforms_2 {
        time: f32,
        fillType: u32,
      }

      @group(0) @binding(0) var<uniform> uniforms_1: Uniforms_2;

      struct LineSegmentVertex_4 {
        position: vec2f,
        radius: f32,
      }

      fn item_3(vertexIndex: u32, time: f32) -> LineSegmentVertex_4 {
        let i = (clamp((f32(vertexIndex) - 1f), 0f, 48f) / 48f);
        let x = ((2f * i) - 1f);
        let s = sin(time);
        let n = (((((10f * s) * s) * s) * s) + 0.25f);
        let base = clamp((1f - pow(abs(x), n)), 0f, 1f);
        return LineSegmentVertex_4(vec2f((0.5f * x), (0.5f * pow(base, (1f / n)))), 0.2f);
      }

      struct mainVertex_Output_5 {
        @builtin(position) outPos: vec4f,
        @location(0) position: vec2f,
        @location(1) uv: vec2f,
        @location(2) @interpolate(flat) instanceIndex: u32,
        @location(3) @interpolate(flat) vertexIndex: u32,
        @location(4) @interpolate(flat) situationIndex: u32,
      }

      struct JoinPath_8 {
        joinIndex: u32,
        path: u32,
        depth: i32,
      }

      fn getJoinParent_9(i: u32) -> u32 {
        return ((i - 4u) >> 1u);
      }

      fn getJoinVertexPath_7(vertexIndex: u32) -> JoinPath_8 {
        var lookup = array<u32, 10>(0u, 0u, 0u, 1u, 1u, 2u, 2u, 2u, 3u, 3u);
        if ((vertexIndex < 10u)) {
          return JoinPath_8(lookup[vertexIndex], 0u, -1i);
        }
        var joinIndex = (vertexIndex - 10u);
        var depth = 0;
        var path = 0u;
        while ((joinIndex >= 4u)) {
          path = ((path << 1u) | (joinIndex & 1u));
          joinIndex = getJoinParent_9(joinIndex);
          depth += 1i;
        }
        return JoinPath_8(joinIndex, path, depth);
      }

      struct LineSegmentOutput_10 {
        vertexPosition: vec2f,
        situationIndex: u32,
      }

      struct ExternalNormals_12 {
        n1: vec2f,
        n2: vec2f,
      }

      fn externalNormals_11(distance: vec2f, r1: f32, r2: f32) -> ExternalNormals_12 {
        var dNorm = normalize(distance);
        let expCos = ((r1 - r2) / length(distance));
        let expSin = sqrt(max(0f, (1f - (expCos * expCos))));
        let a = (dNorm.x * expCos);
        let b = (dNorm.y * expSin);
        let c = (dNorm.x * expSin);
        let d = (dNorm.y * expCos);
        var n1 = vec2f((a - b), (c + d));
        var n2 = vec2f((a + b), (-(c) + d));
        return ExternalNormals_12(n1, n2);
      }

      fn cross2d_14(a: vec2f, b: vec2f) -> f32 {
        return ((a.x * b.y) - (a.y * b.x));
      }

      fn isCCW_15(aX: f32, aYSign: bool, bX: f32, bYSign: bool) -> bool {
        let sameSide = (aYSign == bYSign);
        return select(aYSign, (aYSign == (aX >= bX)), sameSide);
      }

      const lookup_17: array<u32, 8> = array<u32, 8>(5u, 3u, 4u, 3u, 2u, 1u, 0u, 0u);

      fn rank3_16(aGb: bool, bGc: bool, aGc: bool) -> u32 {
        let code = (((u32(aGb) << 2u) | (u32(bGc) << 1u)) | u32(aGc));
        return lookup_17[code];
      }

      fn joinSituationIndex_13(ul: vec2f, ur: vec2f, dl: vec2f, dr: vec2f) -> u32 {
        let crossUL = cross2d_14(ur, ul);
        let crossDL = cross2d_14(ur, dl);
        let crossDR = cross2d_14(ur, dr);
        let signUL = (crossUL >= 0f);
        let signDL = (crossDL >= 0f);
        let signDR = (crossDR >= 0f);
        let dotUL = dot(ur, ul);
        let dotDL = dot(ur, dl);
        let dotDR = dot(ur, dr);
        return rank3_16(isCCW_15(dotUL, signUL, dotDL, signDL), isCCW_15(dotDL, signDL, dotDR, signDR), isCCW_15(dotUL, signUL, dotDR, signDR));
      }

      const JOIN_LIMIT_18: f32 = 0.999f;

      fn rot90ccw_21(v: vec2f) -> vec2f {
        return vec2f(-(v.y), v.x);
      }

      fn rot90cw_22(v: vec2f) -> vec2f {
        return vec2f(v.y, -(v.x));
      }

      fn bisectCcw_20(a: vec2f, b: vec2f) -> vec2f {
        let sin = cross2d_14(a, b);
        let sinSign = select(-1f, 1f, (sin >= 0f));
        var orthoA = rot90ccw_21(a);
        var orthoB = rot90cw_22(b);
        var dir = select(((a + b) * sinSign), (orthoA + orthoB), (dot(a, b) < 0f));
        return normalize(dir);
      }

      fn midPoint_23(a: vec2f, b: vec2f) -> vec2f {
        return (0.5 * (a + b));
      }

      fn addMul_24(a: vec2f, b: vec2f, f: f32) -> vec2f {
        return (a + (b * f));
      }

      fn miterPoint_19(a: vec2f, b: vec2f) -> vec2f {
        let sin_ = cross2d_14(a, b);
        var bisection = bisectCcw_20(a, b);
        let b2 = dot(b, b);
        let cos_ = dot(a, b);
        let diff = (b2 - cos_);
        if (((diff * diff) < 1e-4f)) {
          return midPoint_23(a, b);
        }
        if ((sin_ < 0f)) {
          return (bisection * -1000000);
        }
        let t = (diff / sin_);
        return addMul_24(a, rot90ccw_21(a), t);
      }

      struct LimitAlongResult_26 {
        a: vec2f,
        b: vec2f,
        limitWasHit: bool,
      }

      fn limitTowardsMiddle_25(middle: vec2f, dir: vec2f, p1: vec2f, p2: vec2f) -> LimitAlongResult_26 {
        let t1 = dot((p1 - middle), dir);
        let t2 = dot((p2 - middle), dir);
        if ((t1 <= t2)) {
          return LimitAlongResult_26(p1, p2, false);
        }
        let t = clamp((t1 / (t1 - t2)), 0f, 1f);
        var p = mix(p1, p2, t);
        return LimitAlongResult_26(p, p, true);
      }

      fn item_27(vertexIndex: u32, joinPath: JoinPath_8, V: LineSegmentVertex_4, vu: vec2f, vd: vec2f, _right: vec2f, dir: vec2f, _left: vec2f) -> vec2f {
        var dirRight = rot90cw_22(dir);
        var dirLeft = rot90ccw_21(dir);
        var v0 = addMul_24(vu, dir, (-7.5f * V.radius));
        var v1 = addMul_24(V.position, addMul_24(dirRight, dir, -3f), (3f * V.radius));
        var v2 = addMul_24(V.position, vec2f(), (2f * V.radius));
        var v3 = addMul_24(V.position, addMul_24(dirLeft, dir, -3f), (3f * V.radius));
        var v4 = addMul_24(vd, dir, (-7.5f * V.radius));
        var points = array<vec2f, 5>(v0, v1, v2, v3, v4);
        if ((joinPath.depth >= 0i)) {
          var remove = array<vec2f, 2>(v0, v4);
          let dm = (&remove[(joinPath.joinIndex & 1u)]);
          return (*dm);
        }
        return points[(vertexIndex % 5u)];
      }

      fn miterPointNoCheck_29(a: vec2f, b: vec2f) -> vec2f {
        var ab = (a + b);
        return (ab * (2f / dot(ab, ab)));
      }

      fn item_28(vertexIndex: u32, joinPath: JoinPath_8, V: LineSegmentVertex_4, vu: vec2f, vd: vec2f, right: vec2f, dir: vec2f, left: vec2f) -> vec2f {
        let shouldJoin = (dot(dir, right) < 0f);
        var dirRight = rot90cw_22(dir);
        var dirLeft = rot90ccw_21(dir);
        var u = select(miterPointNoCheck_29(right, dir), (dir + dirRight), shouldJoin);
        var c = dir;
        var d = select(miterPointNoCheck_29(dir, left), (dir + dirLeft), shouldJoin);
        let joinIndex = joinPath.joinIndex;
        if ((joinPath.depth >= 0i)) {
          var miterR = select(right, miterPointNoCheck_29(right, dirRight), shouldJoin);
          var miterL = select(left, miterPointNoCheck_29(dirLeft, left), shouldJoin);
          var parents = array<vec2f, 2>(miterR, miterL);
          let dm = (&parents[(joinIndex & 1u)]);
          return addMul_24(V.position, (*dm), V.radius);
        }
        var v1 = addMul_24(V.position, u, V.radius);
        var v2 = addMul_24(V.position, c, V.radius);
        var v3 = addMul_24(V.position, d, V.radius);
        var points = array<vec2f, 5>(vu, v1, v2, v3, vd);
        return points[(vertexIndex % 5u)];
      }

      struct Intersection_32 {
        valid: bool,
        t: f32,
        point: vec2f,
      }

      fn intersectLines_31(A1: vec2f, A2: vec2f, B1: vec2f, B2: vec2f) -> Intersection_32 {
        var a = (A2 - A1);
        var b = (B2 - B1);
        let axb = cross2d_14(a, b);
        var AB = (B1 - A1);
        let t = (cross2d_14(AB, b) / axb);
        return Intersection_32((axb != 0f), t, addMul_24(A1, a, t));
      }

      fn bisectNoCheck_33(a: vec2f, b: vec2f) -> vec2f {
        return normalize((a + b));
      }

      fn item_30(situationIndex: u32, vertexIndex: u32, joinPath: JoinPath_8, V: LineSegmentVertex_4, vu: vec2f, vd: vec2f, ul: vec2f, ur: vec2f, dl: vec2f, dr: vec2f, joinU: bool, joinD: bool) -> vec2f {
        var midU = bisectCcw_20(ur, ul);
        var midD = bisectCcw_20(dl, dr);
        var midR = bisectCcw_20(ur, dr);
        var midL = bisectCcw_20(dl, ul);
        let shouldCross = ((situationIndex == 1u) || (situationIndex == 4u));
        var crossCenter = intersectLines_31(ul, dl, ur, dr).point;
        var averageCenter = (((ur + ul) + (dl + dr)) * 0.25);
        var uR = ur;
        var u = midU;
        var c = select(averageCenter, crossCenter, shouldCross);
        var d = midD;
        var dR = dr;
        if ((situationIndex == 2u)) {
          uR = ur;
          u = midR;
          c = midR;
          d = midR;
          dR = dr;
        }
        if ((situationIndex == 3u)) {
          uR = ur;
          u = midL;
          c = midL;
          d = midL;
          dR = dr;
        }
        let joinIndex = joinPath.joinIndex;
        if ((joinPath.depth >= 0i)) {
          var parents = array<vec2f, 4>(uR, u, d, dR);
          var d0 = parents[((joinIndex * 2u) & 3u)];
          var d1 = parents[(((joinIndex * 2u) + 1u) & 3u)];
          var dm = bisectCcw_20(d0, d1);
          var path = joinPath.path;
          for (var depth = joinPath.depth; (depth > 0i); depth -= 1i) {
            let isLeftChild = ((path & 1u) == 0u);
            d0 = select(dm, d0, isLeftChild);
            d1 = select(d1, dm, isLeftChild);
            dm = bisectNoCheck_33(d0, d1);
            path >>= 1u;
          }
          return addMul_24(V.position, dm, V.radius);
        }
        var v1 = select(vu, addMul_24(V.position, u, V.radius), joinU);
        var v2 = select(vu, addMul_24(V.position, c, V.radius), (joinU || joinD));
        var v3 = select(vd, addMul_24(V.position, d, V.radius), joinD);
        var points = array<vec2f, 5>(vu, v1, v2, v3, vd);
        return points[(vertexIndex % 5u)];
      }

      fn lineSegmentVariableWidth_6(vertexIndex: u32, A: LineSegmentVertex_4, B: LineSegmentVertex_4, C: LineSegmentVertex_4, D: LineSegmentVertex_4) -> LineSegmentOutput_10 {
        var joinPath = getJoinVertexPath_7(vertexIndex);
        var AB = (B.position - A.position);
        var BC = (C.position - B.position);
        var CD = (D.position - C.position);
        let radiusABDelta = (A.radius - B.radius);
        let radiusBCDelta = (B.radius - C.radius);
        let radiusCDDelta = (C.radius - D.radius);
        if ((dot(BC, BC) <= (radiusBCDelta * radiusBCDelta))) {
          return LineSegmentOutput_10(vec2f(), 0u);
        }
        let isCapB = (dot(AB, AB) <= ((radiusABDelta * radiusABDelta) + 1e-12f));
        let isCapC = (dot(CD, CD) <= ((radiusCDDelta * radiusCDDelta) + 1e-12f));
        var eAB = externalNormals_11(AB, A.radius, B.radius);
        var eBC = externalNormals_11(BC, B.radius, C.radius);
        var eCD = externalNormals_11(CD, C.radius, D.radius);
        var nBC = normalize(BC);
        var nCB = (nBC * -1);
        var d0 = eBC.n1;
        var d4 = eBC.n2;
        var d5 = eBC.n2;
        var d9 = eBC.n1;
        let situationIndexB = joinSituationIndex_13(eAB.n1, eBC.n1, eAB.n2, eBC.n2);
        let situationIndexC = joinSituationIndex_13(eCD.n2, eBC.n2, eCD.n1, eBC.n1);
        var joinBu = true;
        var joinBd = true;
        var joinCu = true;
        var joinCd = true;
        if (!isCapB) {
          if ((((situationIndexB == 1u) || (situationIndexB == 5u)) || (dot(eBC.n2, eAB.n2) > JOIN_LIMIT_18))) {
            d4 = miterPoint_19(eBC.n2, eAB.n2);
            joinBd = false;
          }
          if ((((situationIndexB == 4u) || (situationIndexB == 5u)) || (dot(eAB.n1, eBC.n1) > JOIN_LIMIT_18))) {
            d0 = miterPoint_19(eAB.n1, eBC.n1);
            joinBu = false;
          }
        }
        if (!isCapC) {
          if ((((situationIndexC == 4u) || (situationIndexC == 5u)) || (dot(eCD.n2, eBC.n2) > JOIN_LIMIT_18))) {
            d5 = miterPoint_19(eCD.n2, eBC.n2);
            joinCd = false;
          }
          if ((((situationIndexC == 1u) || (situationIndexC == 5u)) || (dot(eBC.n1, eCD.n1) > JOIN_LIMIT_18))) {
            d9 = miterPoint_19(eBC.n1, eCD.n1);
            joinCu = false;
          }
        }
        var v0 = addMul_24(B.position, d0, B.radius);
        var v4 = addMul_24(B.position, d4, B.radius);
        var v5 = addMul_24(C.position, d5, C.radius);
        var v9 = addMul_24(C.position, d9, C.radius);
        var midBC = midPoint_23(B.position, C.position);
        var tBC1 = rot90cw_22(eBC.n1);
        var tBC2 = rot90ccw_21(eBC.n2);
        var limU = limitTowardsMiddle_25(midBC, tBC1, v0, v9);
        var limD = limitTowardsMiddle_25(midBC, tBC2, v4, v5);
        v0 = limU.a;
        v9 = limU.b;
        v4 = limD.a;
        v5 = limD.b;
        let isCSide = (joinPath.joinIndex >= 2u);
        var situationIndex = situationIndexB;
        var V = B;
        var isCap = isCapB;
        var j1 = eAB.n1;
        var j2 = eBC.n1;
        var j3 = eAB.n2;
        var j4 = eBC.n2;
        var vu = v0;
        var vd = v4;
        var joinU = joinBu;
        var joinD = joinBd;
        if (isCSide) {
          situationIndex = situationIndexC;
          V = C;
          isCap = isCapC;
          j4 = eBC.n1;
          j3 = eCD.n1;
          j2 = eBC.n2;
          j1 = eCD.n2;
          vu = v5;
          vd = v9;
          joinU = joinCd;
          joinD = joinCu;
        }
        let joinIndex = joinPath.joinIndex;
        if ((vertexIndex >= 10u)) {
          var shouldJoin = array<u32, 4>(u32(joinBu), u32(joinBd), u32(joinCd), u32(joinCu));
          if ((shouldJoin[joinIndex] == 0u)) {
            var noJoinPoints = array<vec2f, 4>(v0, v4, v5, v9);
            let vertexPosition2 = (&noJoinPoints[joinIndex]);
            return LineSegmentOutput_10((*vertexPosition2), situationIndex);
          }
        }
        var vertexPosition = vec2f();
        if (isCap) {
          if (isCSide) {
            vertexPosition = item_27(vertexIndex, joinPath, V, vu, vd, j2, nBC, j4);
          }
          else {
            vertexPosition = item_28(vertexIndex, joinPath, V, vu, vd, j2, nCB, j4);
          }
        }
        else {
          vertexPosition = item_30(situationIndex, vertexIndex, joinPath, V, vu, vd, j1, j2, j3, j4, joinU, joinD);
        }
        return LineSegmentOutput_10(vertexPosition, situationIndex);
      }

      fn uvToLineSegment_34(A: vec2f, B: vec2f, point: vec2f) -> vec2f {
        var p = (point - A);
        var AB = (B - A);
        let x = (dot(p, AB) / dot(AB, AB));
        let y = cross2d_14(normalize(AB), p);
        return vec2f(x, y);
      }

      struct mainVertex_Input_35 {
        @builtin(instance_index) instanceIndex: u32,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex_0(_arg_0: mainVertex_Input_35) -> mainVertex_Output_5 {
        let t = uniforms_1.time;
        var A = item_3(_arg_0.instanceIndex, t);
        var B = item_3((_arg_0.instanceIndex + 1u), t);
        var C = item_3((_arg_0.instanceIndex + 2u), t);
        var D = item_3((_arg_0.instanceIndex + 3u), t);
        if (((((A.radius < 0f) || (B.radius < 0f)) || (C.radius < 0f)) || (D.radius < 0f))) {
          return mainVertex_Output_5(vec4f(), vec2f(), vec2f(), 0u, 0u, 0u);
        }
        var result = lineSegmentVariableWidth_6(_arg_0.vertexIndex, A, B, C, D);
        var uv = uvToLineSegment_34(B.position, C.position, result.vertexPosition);
        return mainVertex_Output_5(vec4f(result.vertexPosition, 0f, 1f), result.vertexPosition, uv, _arg_0.instanceIndex, _arg_0.vertexIndex, result.situationIndex);
      }

      struct mainFragment_Input_37 {
        @location(2) @interpolate(flat) instanceIndex: u32,
        @location(3) @interpolate(flat) vertexIndex: u32,
        @location(4) @interpolate(flat) situationIndex: u32,
        @builtin(front_facing) frontFacing: bool,
        @builtin(position) screenPosition: vec4f,
        @location(0) position: vec2f,
        @location(1) uv: vec2f,
      }

      @fragment fn mainFragment_36(_arg_0: mainFragment_Input_37) -> @location(0) vec4f {
        let fillType2 = uniforms_1.fillType;
        if ((fillType2 == 1u)) {
          return mix(vec4f(0.7699999809265137, 0.38999998569488525, 1, 0.5), vec4f(0.10999999940395355, 0.4399999976158142, 0.9399999976158142, 0.5), ((_arg_0.position.x * 0.5f) + 0.5f));
        }
        var color = vec3f();
        var colors = array<vec3f, 9>(vec3f(1, 0, 0), vec3f(0, 1, 0), vec3f(0, 0, 1), vec3f(1, 0, 1), vec3f(1, 1, 0), vec3f(0, 1, 1), vec3f(0.75, 0.25, 0.25), vec3f(0.25, 0.75, 0.25), vec3f(0.25, 0.25, 0.75));
        if ((fillType2 == 2u)) {
          color = colors[(_arg_0.instanceIndex % 9u)];
        }
        if ((fillType2 == 3u)) {
          color = colors[(_arg_0.vertexIndex % 9u)];
        }
        if ((fillType2 == 4u)) {
          color = colors[(_arg_0.situationIndex % 9u)];
        }
        if ((fillType2 == 5u)) {
          color = vec3f(_arg_0.uv.x, cos((_arg_0.uv.y * 100f)), 0f);
        }
        if (_arg_0.frontFacing) {
          return vec4f(color, 0.5f);
        }
        return vec4f(color, select(0f, 1f, (((u32(_arg_0.screenPosition.x) >> 3u) % 2u) != ((u32(_arg_0.screenPosition.y) >> 3u) % 2u))));
      }

      struct outlineFragment_Input_39 {
        @builtin(front_facing) _unused: bool,
      }

      @fragment fn outlineFragment_38(_arg_0: outlineFragment_Input_39) -> @location(0) vec4f {
        return vec4f(0, 0, 0, 0.20000000298023224);
      }

      struct centerlineVertex_Output_41 {
        @builtin(position) outPos: vec4f,
      }

      struct centerlineVertex_Input_42 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn centerlineVertex_40(_arg_0: centerlineVertex_Input_42) -> centerlineVertex_Output_41 {
        let t = uniforms_1.time;
        var vertex = item_3(_arg_0.vertexIndex, t);
        if ((vertex.radius < 0f)) {
          return centerlineVertex_Output_41(vec4f());
        }
        return centerlineVertex_Output_41(vec4f(vertex.position, 0f, 1f));
      }

      struct circlesVertex_Output_44 {
        @builtin(position) outPos: vec4f,
      }

      struct circlesVertex_Input_45 {
        @builtin(instance_index) instanceIndex: u32,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn circlesVertex_43(_arg_0: circlesVertex_Input_45) -> circlesVertex_Output_44 {
        let t = uniforms_1.time;
        var vertex = item_3(_arg_0.instanceIndex, t);
        if ((vertex.radius < 0f)) {
          return circlesVertex_Output_44(vec4f());
        }
        let step = clamp((0.007853981633974483f / vertex.radius), 0.02454369260617026f, 0.39269908169872414f);
        let angle = min(6.283185307179586f, (step * f32(_arg_0.vertexIndex)));
        var unit = vec2f(cos(angle), sin(angle));
        return circlesVertex_Output_44(vec4f(addMul_24(vertex.position, unit, vertex.radius), 0f, 1f));
      }

      struct Uniforms_2 {
        time: f32,
        fillType: u32,
      }

      @group(0) @binding(0) var<uniform> uniforms_1: Uniforms_2;

      const segmentSide_4: array<f32, 4> = array<f32, 4>(-1f, -1f, 1f, 1f);

      struct LineSegmentVertex_5 {
        position: vec2f,
        radius: f32,
      }

      fn item_3(vertexIndex: u32, time: f32) -> LineSegmentVertex_5 {
        var side = segmentSide_4[vertexIndex];
        let r = sin((time + select(0., 1.5707963267948966, (side == -1f))));
        let radius = ((0.4f * r) * r);
        return LineSegmentVertex_5(vec2f(((0.5f * side) * cos(time)), ((0.5f * side) * sin(time))), radius);
      }

      struct mainVertex_Output_6 {
        @builtin(position) outPos: vec4f,
        @location(0) position: vec2f,
        @location(1) uv: vec2f,
        @location(2) @interpolate(flat) instanceIndex: u32,
        @location(3) @interpolate(flat) vertexIndex: u32,
        @location(4) @interpolate(flat) situationIndex: u32,
      }

      struct JoinPath_9 {
        joinIndex: u32,
        path: u32,
        depth: i32,
      }

      fn getJoinParent_10(i: u32) -> u32 {
        return ((i - 4u) >> 1u);
      }

      fn getJoinVertexPath_8(vertexIndex: u32) -> JoinPath_9 {
        var lookup = array<u32, 10>(0u, 0u, 0u, 1u, 1u, 2u, 2u, 2u, 3u, 3u);
        if ((vertexIndex < 10u)) {
          return JoinPath_9(lookup[vertexIndex], 0u, -1i);
        }
        var joinIndex = (vertexIndex - 10u);
        var depth = 0;
        var path = 0u;
        while ((joinIndex >= 4u)) {
          path = ((path << 1u) | (joinIndex & 1u));
          joinIndex = getJoinParent_10(joinIndex);
          depth += 1i;
        }
        return JoinPath_9(joinIndex, path, depth);
      }

      struct LineSegmentOutput_11 {
        vertexPosition: vec2f,
        situationIndex: u32,
      }

      struct ExternalNormals_13 {
        n1: vec2f,
        n2: vec2f,
      }

      fn externalNormals_12(distance: vec2f, r1: f32, r2: f32) -> ExternalNormals_13 {
        var dNorm = normalize(distance);
        let expCos = ((r1 - r2) / length(distance));
        let expSin = sqrt(max(0f, (1f - (expCos * expCos))));
        let a = (dNorm.x * expCos);
        let b = (dNorm.y * expSin);
        let c = (dNorm.x * expSin);
        let d = (dNorm.y * expCos);
        var n1 = vec2f((a - b), (c + d));
        var n2 = vec2f((a + b), (-(c) + d));
        return ExternalNormals_13(n1, n2);
      }

      fn cross2d_15(a: vec2f, b: vec2f) -> f32 {
        return ((a.x * b.y) - (a.y * b.x));
      }

      fn isCCW_16(aX: f32, aYSign: bool, bX: f32, bYSign: bool) -> bool {
        let sameSide = (aYSign == bYSign);
        return select(aYSign, (aYSign == (aX >= bX)), sameSide);
      }

      const lookup_18: array<u32, 8> = array<u32, 8>(5u, 3u, 4u, 3u, 2u, 1u, 0u, 0u);

      fn rank3_17(aGb: bool, bGc: bool, aGc: bool) -> u32 {
        let code = (((u32(aGb) << 2u) | (u32(bGc) << 1u)) | u32(aGc));
        return lookup_18[code];
      }

      fn joinSituationIndex_14(ul: vec2f, ur: vec2f, dl: vec2f, dr: vec2f) -> u32 {
        let crossUL = cross2d_15(ur, ul);
        let crossDL = cross2d_15(ur, dl);
        let crossDR = cross2d_15(ur, dr);
        let signUL = (crossUL >= 0f);
        let signDL = (crossDL >= 0f);
        let signDR = (crossDR >= 0f);
        let dotUL = dot(ur, ul);
        let dotDL = dot(ur, dl);
        let dotDR = dot(ur, dr);
        return rank3_17(isCCW_16(dotUL, signUL, dotDL, signDL), isCCW_16(dotDL, signDL, dotDR, signDR), isCCW_16(dotUL, signUL, dotDR, signDR));
      }

      const JOIN_LIMIT_19: f32 = 0.999f;

      fn rot90ccw_22(v: vec2f) -> vec2f {
        return vec2f(-(v.y), v.x);
      }

      fn rot90cw_23(v: vec2f) -> vec2f {
        return vec2f(v.y, -(v.x));
      }

      fn bisectCcw_21(a: vec2f, b: vec2f) -> vec2f {
        let sin = cross2d_15(a, b);
        let sinSign = select(-1f, 1f, (sin >= 0f));
        var orthoA = rot90ccw_22(a);
        var orthoB = rot90cw_23(b);
        var dir = select(((a + b) * sinSign), (orthoA + orthoB), (dot(a, b) < 0f));
        return normalize(dir);
      }

      fn midPoint_24(a: vec2f, b: vec2f) -> vec2f {
        return (0.5 * (a + b));
      }

      fn addMul_25(a: vec2f, b: vec2f, f: f32) -> vec2f {
        return (a + (b * f));
      }

      fn miterPoint_20(a: vec2f, b: vec2f) -> vec2f {
        let sin_ = cross2d_15(a, b);
        var bisection = bisectCcw_21(a, b);
        let b2 = dot(b, b);
        let cos_ = dot(a, b);
        let diff = (b2 - cos_);
        if (((diff * diff) < 1e-4f)) {
          return midPoint_24(a, b);
        }
        if ((sin_ < 0f)) {
          return (bisection * -1000000);
        }
        let t = (diff / sin_);
        return addMul_25(a, rot90ccw_22(a), t);
      }

      struct LimitAlongResult_27 {
        a: vec2f,
        b: vec2f,
        limitWasHit: bool,
      }

      fn limitTowardsMiddle_26(middle: vec2f, dir: vec2f, p1: vec2f, p2: vec2f) -> LimitAlongResult_27 {
        let t1 = dot((p1 - middle), dir);
        let t2 = dot((p2 - middle), dir);
        if ((t1 <= t2)) {
          return LimitAlongResult_27(p1, p2, false);
        }
        let t = clamp((t1 / (t1 - t2)), 0f, 1f);
        var p = mix(p1, p2, t);
        return LimitAlongResult_27(p, p, true);
      }

      fn item_28(vertexIndex: u32, joinPath: JoinPath_9, V: LineSegmentVertex_5, vu: vec2f, vd: vec2f, right: vec2f, dir: vec2f, left: vec2f) -> vec2f {
        if ((joinPath.depth >= 0i)) {
          var remove = array<vec2f, 2>(right, left);
          var dm = remove[(joinPath.joinIndex & 1u)];
          return addMul_25(V.position, dm, V.radius);
        }
        var v1 = addMul_25(V.position, (right + dir), V.radius);
        var v2 = addMul_25(V.position, midPoint_24(right, left), V.radius);
        var v3 = addMul_25(V.position, (left + dir), V.radius);
        var points = array<vec2f, 5>(vu, v1, v2, v3, vd);
        return points[(vertexIndex % 5u)];
      }

      fn bisectNoCheck_30(a: vec2f, b: vec2f) -> vec2f {
        return normalize((a + b));
      }

      fn item_29(vertexIndex: u32, joinPath: JoinPath_9, V: LineSegmentVertex_5, vu: vec2f, vd: vec2f, right: vec2f, dir: vec2f, left: vec2f) -> vec2f {
        var uR = right;
        var u = dir;
        var c = dir;
        var d = dir;
        var dR = left;
        let joinIndex = joinPath.joinIndex;
        if ((joinPath.depth >= 0i)) {
          var parents = array<vec2f, 4>(uR, u, d, dR);
          var d0 = parents[((joinIndex * 2u) & 3u)];
          var d1 = parents[(((joinIndex * 2u) + 1u) & 3u)];
          var dm = bisectCcw_21(d0, d1);
          var path = joinPath.path;
          for (var depth = joinPath.depth; (depth > 0i); depth -= 1i) {
            let isLeftChild = ((path & 1u) == 0u);
            d0 = select(dm, d0, isLeftChild);
            d1 = select(d1, dm, isLeftChild);
            dm = bisectNoCheck_30(d0, d1);
            path >>= 1u;
          }
          return addMul_25(V.position, dm, V.radius);
        }
        var v1 = addMul_25(V.position, u, V.radius);
        var v2 = addMul_25(V.position, c, V.radius);
        var v3 = addMul_25(V.position, d, V.radius);
        var points = array<vec2f, 5>(vu, v1, v2, v3, vd);
        return points[(vertexIndex % 5u)];
      }

      fn miterLimit_32(miter: vec2f, limitRatio: f32) -> vec2f {
        let m2 = dot(miter, miter);
        if ((m2 > (limitRatio * limitRatio))) {
          return (normalize(miter) * ((((limitRatio - 1f) * ((limitRatio * limitRatio) - 1f)) / (m2 - 1f)) + 1f));
        }
        return miter;
      }

      struct Intersection_34 {
        valid: bool,
        t: f32,
        point: vec2f,
      }

      fn intersectLines_33(A1: vec2f, A2: vec2f, B1: vec2f, B2: vec2f) -> Intersection_34 {
        var a = (A2 - A1);
        var b = (B2 - B1);
        let axb = cross2d_15(a, b);
        var AB = (B1 - A1);
        let t = (cross2d_15(AB, b) / axb);
        return Intersection_34((axb != 0f), t, addMul_25(A1, a, t));
      }

      fn item_31(situationIndex: u32, vertexIndex: u32, joinPath: JoinPath_9, V: LineSegmentVertex_5, vu: vec2f, vd: vec2f, ul: vec2f, ur: vec2f, dl: vec2f, dr: vec2f, joinU: bool, joinD: bool) -> vec2f {
        var miterU = miterPoint_20(ur, ul);
        var miterD = miterPoint_20(dl, dr);
        miterU = miterLimit_32(miterU, 2f);
        miterD = miterLimit_32(miterD, 2f);
        let shouldCross = ((situationIndex == 1u) || (situationIndex == 4u));
        var crossCenter = intersectLines_33(ul, dl, ur, dr).point;
        var averageCenter = ((normalize(miterU) + normalize(miterD)) * 0.5);
        var uR = ur;
        var u = miterU;
        var c = select(averageCenter, crossCenter, shouldCross);
        var d = miterD;
        var dR = dr;
        if ((situationIndex == 2u)) {
          var mid = bisectCcw_21(ur, dr);
          uR = ur;
          u = mid;
          c = mid;
          d = mid;
          dR = dr;
        }
        if ((situationIndex == 3u)) {
          var mid = bisectCcw_21(dl, ul);
          uR = ur;
          u = mid;
          c = mid;
          d = mid;
          dR = dr;
        }
        let joinIndex = joinPath.joinIndex;
        if ((joinPath.depth >= 0i)) {
          var parents = array<vec2f, 4>(uR, u, d, dR);
          var d0 = parents[((joinIndex * 2u) & 3u)];
          var d1 = parents[(((joinIndex * 2u) + 1u) & 3u)];
          var dm = miterPoint_20(d0, d1);
          return addMul_25(V.position, dm, V.radius);
        }
        var v1 = select(vu, addMul_25(V.position, u, V.radius), joinU);
        var v2 = select(vu, addMul_25(V.position, c, V.radius), (joinU || joinD));
        var v3 = select(vd, addMul_25(V.position, d, V.radius), joinD);
        var points = array<vec2f, 5>(vu, v1, v2, v3, vd);
        return points[(vertexIndex % 5u)];
      }

      fn lineSegmentVariableWidth_7(vertexIndex: u32, A: LineSegmentVertex_5, B: LineSegmentVertex_5, C: LineSegmentVertex_5, D: LineSegmentVertex_5) -> LineSegmentOutput_11 {
        var joinPath = getJoinVertexPath_8(vertexIndex);
        var AB = (B.position - A.position);
        var BC = (C.position - B.position);
        var CD = (D.position - C.position);
        let radiusABDelta = (A.radius - B.radius);
        let radiusBCDelta = (B.radius - C.radius);
        let radiusCDDelta = (C.radius - D.radius);
        if ((dot(BC, BC) <= (radiusBCDelta * radiusBCDelta))) {
          return LineSegmentOutput_11(vec2f(), 0u);
        }
        let isCapB = (dot(AB, AB) <= ((radiusABDelta * radiusABDelta) + 1e-12f));
        let isCapC = (dot(CD, CD) <= ((radiusCDDelta * radiusCDDelta) + 1e-12f));
        var eAB = externalNormals_12(AB, A.radius, B.radius);
        var eBC = externalNormals_12(BC, B.radius, C.radius);
        var eCD = externalNormals_12(CD, C.radius, D.radius);
        var nBC = normalize(BC);
        var nCB = (nBC * -1);
        var d0 = eBC.n1;
        var d4 = eBC.n2;
        var d5 = eBC.n2;
        var d9 = eBC.n1;
        let situationIndexB = joinSituationIndex_14(eAB.n1, eBC.n1, eAB.n2, eBC.n2);
        let situationIndexC = joinSituationIndex_14(eCD.n2, eBC.n2, eCD.n1, eBC.n1);
        var joinBu = true;
        var joinBd = true;
        var joinCu = true;
        var joinCd = true;
        if (!isCapB) {
          if ((((situationIndexB == 1u) || (situationIndexB == 5u)) || (dot(eBC.n2, eAB.n2) > JOIN_LIMIT_19))) {
            d4 = miterPoint_20(eBC.n2, eAB.n2);
            joinBd = false;
          }
          if ((((situationIndexB == 4u) || (situationIndexB == 5u)) || (dot(eAB.n1, eBC.n1) > JOIN_LIMIT_19))) {
            d0 = miterPoint_20(eAB.n1, eBC.n1);
            joinBu = false;
          }
        }
        if (!isCapC) {
          if ((((situationIndexC == 4u) || (situationIndexC == 5u)) || (dot(eCD.n2, eBC.n2) > JOIN_LIMIT_19))) {
            d5 = miterPoint_20(eCD.n2, eBC.n2);
            joinCd = false;
          }
          if ((((situationIndexC == 1u) || (situationIndexC == 5u)) || (dot(eBC.n1, eCD.n1) > JOIN_LIMIT_19))) {
            d9 = miterPoint_20(eBC.n1, eCD.n1);
            joinCu = false;
          }
        }
        var v0 = addMul_25(B.position, d0, B.radius);
        var v4 = addMul_25(B.position, d4, B.radius);
        var v5 = addMul_25(C.position, d5, C.radius);
        var v9 = addMul_25(C.position, d9, C.radius);
        var midBC = midPoint_24(B.position, C.position);
        var tBC1 = rot90cw_23(eBC.n1);
        var tBC2 = rot90ccw_22(eBC.n2);
        var limU = limitTowardsMiddle_26(midBC, tBC1, v0, v9);
        var limD = limitTowardsMiddle_26(midBC, tBC2, v4, v5);
        v0 = limU.a;
        v9 = limU.b;
        v4 = limD.a;
        v5 = limD.b;
        let isCSide = (joinPath.joinIndex >= 2u);
        var situationIndex = situationIndexB;
        var V = B;
        var isCap = isCapB;
        var j1 = eAB.n1;
        var j2 = eBC.n1;
        var j3 = eAB.n2;
        var j4 = eBC.n2;
        var vu = v0;
        var vd = v4;
        var joinU = joinBu;
        var joinD = joinBd;
        if (isCSide) {
          situationIndex = situationIndexC;
          V = C;
          isCap = isCapC;
          j4 = eBC.n1;
          j3 = eCD.n1;
          j2 = eBC.n2;
          j1 = eCD.n2;
          vu = v5;
          vd = v9;
          joinU = joinCd;
          joinD = joinCu;
        }
        let joinIndex = joinPath.joinIndex;
        if ((vertexIndex >= 10u)) {
          var shouldJoin = array<u32, 4>(u32(joinBu), u32(joinBd), u32(joinCd), u32(joinCu));
          if ((shouldJoin[joinIndex] == 0u)) {
            var noJoinPoints = array<vec2f, 4>(v0, v4, v5, v9);
            let vertexPosition2 = (&noJoinPoints[joinIndex]);
            return LineSegmentOutput_11((*vertexPosition2), situationIndex);
          }
        }
        var vertexPosition = vec2f();
        if (isCap) {
          if (isCSide) {
            vertexPosition = item_28(vertexIndex, joinPath, V, vu, vd, j2, nBC, j4);
          }
          else {
            vertexPosition = item_29(vertexIndex, joinPath, V, vu, vd, j2, nCB, j4);
          }
        }
        else {
          vertexPosition = item_31(situationIndex, vertexIndex, joinPath, V, vu, vd, j1, j2, j3, j4, joinU, joinD);
        }
        return LineSegmentOutput_11(vertexPosition, situationIndex);
      }

      fn uvToLineSegment_35(A: vec2f, B: vec2f, point: vec2f) -> vec2f {
        var p = (point - A);
        var AB = (B - A);
        let x = (dot(p, AB) / dot(AB, AB));
        let y = cross2d_15(normalize(AB), p);
        return vec2f(x, y);
      }

      struct mainVertex_Input_36 {
        @builtin(instance_index) instanceIndex: u32,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex_0(_arg_0: mainVertex_Input_36) -> mainVertex_Output_6 {
        let t = uniforms_1.time;
        var A = item_3(_arg_0.instanceIndex, t);
        var B = item_3((_arg_0.instanceIndex + 1u), t);
        var C = item_3((_arg_0.instanceIndex + 2u), t);
        var D = item_3((_arg_0.instanceIndex + 3u), t);
        if (((((A.radius < 0f) || (B.radius < 0f)) || (C.radius < 0f)) || (D.radius < 0f))) {
          return mainVertex_Output_6(vec4f(), vec2f(), vec2f(), 0u, 0u, 0u);
        }
        var result = lineSegmentVariableWidth_7(_arg_0.vertexIndex, A, B, C, D);
        var uv = uvToLineSegment_35(B.position, C.position, result.vertexPosition);
        return mainVertex_Output_6(vec4f(result.vertexPosition, 0f, 1f), result.vertexPosition, uv, _arg_0.instanceIndex, _arg_0.vertexIndex, result.situationIndex);
      }

      struct mainFragment_Input_38 {
        @location(2) @interpolate(flat) instanceIndex: u32,
        @location(3) @interpolate(flat) vertexIndex: u32,
        @location(4) @interpolate(flat) situationIndex: u32,
        @builtin(front_facing) frontFacing: bool,
        @builtin(position) screenPosition: vec4f,
        @location(0) position: vec2f,
        @location(1) uv: vec2f,
      }

      @fragment fn mainFragment_37(_arg_0: mainFragment_Input_38) -> @location(0) vec4f {
        let fillType2 = uniforms_1.fillType;
        if ((fillType2 == 1u)) {
          return mix(vec4f(0.7699999809265137, 0.38999998569488525, 1, 0.5), vec4f(0.10999999940395355, 0.4399999976158142, 0.9399999976158142, 0.5), ((_arg_0.position.x * 0.5f) + 0.5f));
        }
        var color = vec3f();
        var colors = array<vec3f, 9>(vec3f(1, 0, 0), vec3f(0, 1, 0), vec3f(0, 0, 1), vec3f(1, 0, 1), vec3f(1, 1, 0), vec3f(0, 1, 1), vec3f(0.75, 0.25, 0.25), vec3f(0.25, 0.75, 0.25), vec3f(0.25, 0.25, 0.75));
        if ((fillType2 == 2u)) {
          color = colors[(_arg_0.instanceIndex % 9u)];
        }
        if ((fillType2 == 3u)) {
          color = colors[(_arg_0.vertexIndex % 9u)];
        }
        if ((fillType2 == 4u)) {
          color = colors[(_arg_0.situationIndex % 9u)];
        }
        if ((fillType2 == 5u)) {
          color = vec3f(_arg_0.uv.x, cos((_arg_0.uv.y * 100f)), 0f);
        }
        if (_arg_0.frontFacing) {
          return vec4f(color, 0.5f);
        }
        return vec4f(color, select(0f, 1f, (((u32(_arg_0.screenPosition.x) >> 3u) % 2u) != ((u32(_arg_0.screenPosition.y) >> 3u) % 2u))));
      }

      struct outlineFragment_Input_40 {
        @builtin(front_facing) _unused: bool,
      }

      @fragment fn outlineFragment_39(_arg_0: outlineFragment_Input_40) -> @location(0) vec4f {
        return vec4f(0, 0, 0, 0.20000000298023224);
      }

      struct centerlineVertex_Output_42 {
        @builtin(position) outPos: vec4f,
      }

      struct centerlineVertex_Input_43 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn centerlineVertex_41(_arg_0: centerlineVertex_Input_43) -> centerlineVertex_Output_42 {
        let t = uniforms_1.time;
        var vertex = item_3(_arg_0.vertexIndex, t);
        if ((vertex.radius < 0f)) {
          return centerlineVertex_Output_42(vec4f());
        }
        return centerlineVertex_Output_42(vec4f(vertex.position, 0f, 1f));
      }

      struct circlesVertex_Output_45 {
        @builtin(position) outPos: vec4f,
      }

      struct circlesVertex_Input_46 {
        @builtin(instance_index) instanceIndex: u32,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn circlesVertex_44(_arg_0: circlesVertex_Input_46) -> circlesVertex_Output_45 {
        let t = uniforms_1.time;
        var vertex = item_3(_arg_0.instanceIndex, t);
        if ((vertex.radius < 0f)) {
          return circlesVertex_Output_45(vec4f());
        }
        let step = clamp((0.007853981633974483f / vertex.radius), 0.02454369260617026f, 0.39269908169872414f);
        let angle = min(6.283185307179586f, (step * f32(_arg_0.vertexIndex)));
        var unit = vec2f(cos(angle), sin(angle));
        return circlesVertex_Output_45(vec4f(addMul_25(vertex.position, unit, vertex.radius), 0f, 1f));
      }"
    `);
  });
});
