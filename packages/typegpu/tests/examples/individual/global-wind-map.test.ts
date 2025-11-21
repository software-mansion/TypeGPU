/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('global wind map example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'wind-map',
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Uniforms_2 {
        stepSize: f32,
        frameCount: u32,
      }

      @group(0) @binding(0) var<uniform> uniforms_1: Uniforms_2;

      struct ParticleTrail_4 {
        positions: array<vec2f, 20>,
      }

      @group(0) @binding(1) var<storage, read_write> particles_3: array<ParticleTrail_4>;

      fn vectorField_5(pos: vec2f) -> vec2f {
        return normalize(vec2f(-(pos.y), pos.x));
      }

      struct advectCompute_Input_6 {
        @builtin(global_invocation_id) globalInvocationId: vec3u,
      }

      @compute @workgroup_size(64) fn advectCompute_0(_arg_0: advectCompute_Input_6) {
        let stepSize = uniforms_1.stepSize;
        let frameCount2 = uniforms_1.frameCount;
        let particleIndex = _arg_0.globalInvocationId.x;
        let particle = (&particles_3[particleIndex]);
        let currentPosIndex = (frameCount2 % 20u);
        let prevPosIndex = (((20u + frameCount2) - 1u) % 20u);
        let pos = (&(*particle).positions[prevPosIndex]);
        var v0 = vectorField_5((*pos));
        var v1 = vectorField_5(((*pos) + (v0 * (0.5f * stepSize))));
        var newPos = ((*pos) + (v1 * stepSize));
        (*particle).positions[currentPosIndex] = newPos;
        particles_3[particleIndex] = (*particle);
      }

      struct Uniforms_2 {
        stepSize: f32,
        frameCount: u32,
      }

      @group(0) @binding(0) var<uniform> uniforms_1: Uniforms_2;

      struct mainVertex_Output_3 {
        @builtin(position) outPos: vec4f,
        @location(0) position: vec2f,
        @location(1) trailPosition: f32,
      }

      struct ParticleTrail_5 {
        positions: array<vec2f, 20>,
      }

      @group(0) @binding(1) var<storage, read> particles_4: array<ParticleTrail_5>;

      fn lineWidth_6(x: f32) -> f32 {
        return (4e-3f * (1f - x));
      }

      struct LineSegmentVertex_7 {
        position: vec2f,
        radius: f32,
      }

      struct JoinPath_10 {
        joinIndex: u32,
        path: u32,
        depth: i32,
      }

      fn getJoinParent_11(i: u32) -> u32 {
        return ((i - 4u) >> 1u);
      }

      fn getJoinVertexPath_9(vertexIndex: u32) -> JoinPath_10 {
        var lookup = array<u32, 10>(0u, 0u, 0u, 1u, 1u, 2u, 2u, 2u, 3u, 3u);
        if ((vertexIndex < 10u)) {
          return JoinPath_10(lookup[vertexIndex], 0u, -1i);
        }
        var joinIndex = (vertexIndex - 10u);
        var depth = 0;
        var path = 0u;
        while ((joinIndex >= 4u)) {
          path = ((path << 1u) | (joinIndex & 1u));
          joinIndex = getJoinParent_11(joinIndex);
          depth += 1i;
        }
        return JoinPath_10(joinIndex, path, depth);
      }

      struct LineSegmentOutput_12 {
        vertexPosition: vec2f,
        situationIndex: u32,
      }

      struct ExternalNormals_14 {
        n1: vec2f,
        n2: vec2f,
      }

      fn externalNormals_13(distance: vec2f, r1: f32, r2: f32) -> ExternalNormals_14 {
        var dNorm = normalize(distance);
        let expCos = ((r1 - r2) / length(distance));
        let expSin = sqrt(max(0f, (1f - (expCos * expCos))));
        let a = (dNorm.x * expCos);
        let b = (dNorm.y * expSin);
        let c = (dNorm.x * expSin);
        let d = (dNorm.y * expCos);
        var n1 = vec2f((a - b), (c + d));
        var n2 = vec2f((a + b), (-(c) + d));
        return ExternalNormals_14(n1, n2);
      }

      fn cross2d_16(a: vec2f, b: vec2f) -> f32 {
        return ((a.x * b.y) - (a.y * b.x));
      }

      fn isCCW_17(aX: f32, aYSign: bool, bX: f32, bYSign: bool) -> bool {
        let sameSide = (aYSign == bYSign);
        return select(aYSign, (aYSign == (aX >= bX)), sameSide);
      }

      const lookup_19: array<u32, 8> = array<u32, 8>(5u, 3u, 4u, 3u, 2u, 1u, 0u, 0u);

      fn rank3_18(aGb: bool, bGc: bool, aGc: bool) -> u32 {
        let code = (((u32(aGb) << 2u) | (u32(bGc) << 1u)) | u32(aGc));
        return lookup_19[code];
      }

      fn joinSituationIndex_15(ul: vec2f, ur: vec2f, dl: vec2f, dr: vec2f) -> u32 {
        let crossUL = cross2d_16(ur, ul);
        let crossDL = cross2d_16(ur, dl);
        let crossDR = cross2d_16(ur, dr);
        let signUL = (crossUL >= 0f);
        let signDL = (crossDL >= 0f);
        let signDR = (crossDR >= 0f);
        let dotUL = dot(ur, ul);
        let dotDL = dot(ur, dl);
        let dotDR = dot(ur, dr);
        return rank3_18(isCCW_17(dotUL, signUL, dotDL, signDL), isCCW_17(dotDL, signDL, dotDR, signDR), isCCW_17(dotUL, signUL, dotDR, signDR));
      }

      const JOIN_LIMIT_20: f32 = 0.999f;

      fn rot90ccw_23(v: vec2f) -> vec2f {
        return vec2f(-(v.y), v.x);
      }

      fn rot90cw_24(v: vec2f) -> vec2f {
        return vec2f(v.y, -(v.x));
      }

      fn bisectCcw_22(a: vec2f, b: vec2f) -> vec2f {
        let sin = cross2d_16(a, b);
        let sinSign = select(-1f, 1f, (sin >= 0f));
        var orthoA = rot90ccw_23(a);
        var orthoB = rot90cw_24(b);
        var dir = select(((a + b) * sinSign), (orthoA + orthoB), (dot(a, b) < 0f));
        return normalize(dir);
      }

      fn midPoint_25(a: vec2f, b: vec2f) -> vec2f {
        return (0.5 * (a + b));
      }

      fn addMul_26(a: vec2f, b: vec2f, f: f32) -> vec2f {
        return (a + (b * f));
      }

      fn miterPoint_21(a: vec2f, b: vec2f) -> vec2f {
        let sin_ = cross2d_16(a, b);
        var bisection = bisectCcw_22(a, b);
        let b2 = dot(b, b);
        let cos_ = dot(a, b);
        let diff = (b2 - cos_);
        if (((diff * diff) < 1e-4f)) {
          return midPoint_25(a, b);
        }
        if ((sin_ < 0f)) {
          return (bisection * -1000000);
        }
        let t = (diff / sin_);
        return addMul_26(a, rot90ccw_23(a), t);
      }

      struct LimitAlongResult_28 {
        a: vec2f,
        b: vec2f,
        limitWasHit: bool,
      }

      fn limitTowardsMiddle_27(middle: vec2f, dir: vec2f, p1: vec2f, p2: vec2f) -> LimitAlongResult_28 {
        let t1 = dot((p1 - middle), dir);
        let t2 = dot((p2 - middle), dir);
        if ((t1 <= t2)) {
          return LimitAlongResult_28(p1, p2, false);
        }
        let t = clamp((t1 / (t1 - t2)), 0f, 1f);
        var p = mix(p1, p2, t);
        return LimitAlongResult_28(p, p, true);
      }

      fn intersectTangent_30(a: vec2f, n: vec2f) -> vec2f {
        let cos_ = dot(a, n);
        return (n * (1f / cos_));
      }

      fn miterPointNoCheck_31(a: vec2f, b: vec2f) -> vec2f {
        var ab = (a + b);
        return (ab * (2f / dot(ab, ab)));
      }

      fn item_29(vertexIndex: u32, joinPath: JoinPath_10, V: LineSegmentVertex_7, vu: vec2f, vd: vec2f, right: vec2f, dir: vec2f, left: vec2f) -> vec2f {
        let shouldJoin = (dot(dir, right) < 0f);
        var dirRight = rot90cw_24(dir);
        var dirLeft = rot90ccw_23(dir);
        var u = select(intersectTangent_30(right, dirRight), dirRight, shouldJoin);
        var c = vec2f();
        var d = select(intersectTangent_30(left, dirLeft), dirLeft, shouldJoin);
        let joinIndex = joinPath.joinIndex;
        if ((joinPath.depth >= 0i)) {
          var miterR = select(u, miterPointNoCheck_31(right, dirRight), shouldJoin);
          var miterL = select(d, miterPointNoCheck_31(dirLeft, left), shouldJoin);
          var parents = array<vec2f, 2>(miterR, miterL);
          let dm = (&parents[(joinIndex & 1u)]);
          return addMul_26(V.position, (*dm), V.radius);
        }
        var v1 = addMul_26(V.position, u, V.radius);
        var v0 = select(v1, vu, shouldJoin);
        var v2 = addMul_26(V.position, c, V.radius);
        var v3 = addMul_26(V.position, d, V.radius);
        var v4 = select(v3, vd, shouldJoin);
        var points = array<vec2f, 5>(v0, v1, v2, v3, v4);
        return points[(vertexIndex % 5u)];
      }

      fn item_32(vertexIndex: u32, joinPath: JoinPath_10, V: LineSegmentVertex_7, vu: vec2f, vd: vec2f, _right: vec2f, dir: vec2f, _left: vec2f) -> vec2f {
        var dirRight = rot90cw_24(dir);
        var dirLeft = rot90ccw_23(dir);
        var v0 = addMul_26(vu, dir, (-7.5f * V.radius));
        var v1 = addMul_26(V.position, addMul_26(dirRight, dir, -3f), (3f * V.radius));
        var v2 = addMul_26(V.position, vec2f(), (2f * V.radius));
        var v3 = addMul_26(V.position, addMul_26(dirLeft, dir, -3f), (3f * V.radius));
        var v4 = addMul_26(vd, dir, (-7.5f * V.radius));
        var points = array<vec2f, 5>(v0, v1, v2, v3, v4);
        if ((joinPath.depth >= 0i)) {
          var remove = array<vec2f, 2>(v0, v4);
          let dm = (&remove[(joinPath.joinIndex & 1u)]);
          return (*dm);
        }
        return points[(vertexIndex % 5u)];
      }

      struct Intersection_35 {
        valid: bool,
        t: f32,
        point: vec2f,
      }

      fn intersectLines_34(A1: vec2f, A2: vec2f, B1: vec2f, B2: vec2f) -> Intersection_35 {
        var a = (A2 - A1);
        var b = (B2 - B1);
        let axb = cross2d_16(a, b);
        var AB = (B1 - A1);
        let t = (cross2d_16(AB, b) / axb);
        return Intersection_35((axb != 0f), t, addMul_26(A1, a, t));
      }

      fn bisectNoCheck_36(a: vec2f, b: vec2f) -> vec2f {
        return normalize((a + b));
      }

      fn item_33(situationIndex: u32, vertexIndex: u32, joinPath: JoinPath_10, V: LineSegmentVertex_7, vu: vec2f, vd: vec2f, ul: vec2f, ur: vec2f, dl: vec2f, dr: vec2f, joinU: bool, joinD: bool) -> vec2f {
        var midU = bisectCcw_22(ur, ul);
        var midD = bisectCcw_22(dl, dr);
        var midR = bisectCcw_22(ur, dr);
        var midL = bisectCcw_22(dl, ul);
        let shouldCross = ((situationIndex == 1u) || (situationIndex == 4u));
        var crossCenter = intersectLines_34(ul, dl, ur, dr).point;
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
          var dm = bisectCcw_22(d0, d1);
          var path = joinPath.path;
          for (var depth = joinPath.depth; (depth > 0i); depth -= 1i) {
            let isLeftChild = ((path & 1u) == 0u);
            d0 = select(dm, d0, isLeftChild);
            d1 = select(d1, dm, isLeftChild);
            dm = bisectNoCheck_36(d0, d1);
            path >>= 1u;
          }
          return addMul_26(V.position, dm, V.radius);
        }
        var v1 = select(vu, addMul_26(V.position, u, V.radius), joinU);
        var v2 = select(vu, addMul_26(V.position, c, V.radius), (joinU || joinD));
        var v3 = select(vd, addMul_26(V.position, d, V.radius), joinD);
        var points = array<vec2f, 5>(vu, v1, v2, v3, vd);
        return points[(vertexIndex % 5u)];
      }

      fn lineSegmentVariableWidth_8(vertexIndex: u32, A: LineSegmentVertex_7, B: LineSegmentVertex_7, C: LineSegmentVertex_7, D: LineSegmentVertex_7) -> LineSegmentOutput_12 {
        var joinPath = getJoinVertexPath_9(vertexIndex);
        var AB = (B.position - A.position);
        var BC = (C.position - B.position);
        var CD = (D.position - C.position);
        let radiusABDelta = (A.radius - B.radius);
        let radiusBCDelta = (B.radius - C.radius);
        let radiusCDDelta = (C.radius - D.radius);
        if ((dot(BC, BC) <= (radiusBCDelta * radiusBCDelta))) {
          return LineSegmentOutput_12(vec2f(), 0u);
        }
        let isCapB = (dot(AB, AB) <= ((radiusABDelta * radiusABDelta) + 1e-12f));
        let isCapC = (dot(CD, CD) <= ((radiusCDDelta * radiusCDDelta) + 1e-12f));
        var eAB = externalNormals_13(AB, A.radius, B.radius);
        var eBC = externalNormals_13(BC, B.radius, C.radius);
        var eCD = externalNormals_13(CD, C.radius, D.radius);
        var nBC = normalize(BC);
        var nCB = (nBC * -1);
        var d0 = eBC.n1;
        var d4 = eBC.n2;
        var d5 = eBC.n2;
        var d9 = eBC.n1;
        let situationIndexB = joinSituationIndex_15(eAB.n1, eBC.n1, eAB.n2, eBC.n2);
        let situationIndexC = joinSituationIndex_15(eCD.n2, eBC.n2, eCD.n1, eBC.n1);
        var joinBu = true;
        var joinBd = true;
        var joinCu = true;
        var joinCd = true;
        if (!isCapB) {
          if ((((situationIndexB == 1u) || (situationIndexB == 5u)) || (dot(eBC.n2, eAB.n2) > JOIN_LIMIT_20))) {
            d4 = miterPoint_21(eBC.n2, eAB.n2);
            joinBd = false;
          }
          if ((((situationIndexB == 4u) || (situationIndexB == 5u)) || (dot(eAB.n1, eBC.n1) > JOIN_LIMIT_20))) {
            d0 = miterPoint_21(eAB.n1, eBC.n1);
            joinBu = false;
          }
        }
        if (!isCapC) {
          if ((((situationIndexC == 4u) || (situationIndexC == 5u)) || (dot(eCD.n2, eBC.n2) > JOIN_LIMIT_20))) {
            d5 = miterPoint_21(eCD.n2, eBC.n2);
            joinCd = false;
          }
          if ((((situationIndexC == 1u) || (situationIndexC == 5u)) || (dot(eBC.n1, eCD.n1) > JOIN_LIMIT_20))) {
            d9 = miterPoint_21(eBC.n1, eCD.n1);
            joinCu = false;
          }
        }
        var v0 = addMul_26(B.position, d0, B.radius);
        var v4 = addMul_26(B.position, d4, B.radius);
        var v5 = addMul_26(C.position, d5, C.radius);
        var v9 = addMul_26(C.position, d9, C.radius);
        var midBC = midPoint_25(B.position, C.position);
        var tBC1 = rot90cw_24(eBC.n1);
        var tBC2 = rot90ccw_23(eBC.n2);
        var limU = limitTowardsMiddle_27(midBC, tBC1, v0, v9);
        var limD = limitTowardsMiddle_27(midBC, tBC2, v4, v5);
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
            return LineSegmentOutput_12((*vertexPosition2), situationIndex);
          }
        }
        var vertexPosition = vec2f();
        if (isCap) {
          if (isCSide) {
            vertexPosition = item_29(vertexIndex, joinPath, V, vu, vd, j2, nBC, j4);
          }
          else {
            vertexPosition = item_32(vertexIndex, joinPath, V, vu, vd, j2, nCB, j4);
          }
        }
        else {
          vertexPosition = item_33(situationIndex, vertexIndex, joinPath, V, vu, vd, j1, j2, j3, j4, joinU, joinD);
        }
        return LineSegmentOutput_12(vertexPosition, situationIndex);
      }

      struct mainVertex_Input_37 {
        @builtin(instance_index) instanceIndex: u32,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex_0(_arg_0: mainVertex_Input_37) -> mainVertex_Output_3 {
        let frameCount2 = uniforms_1.frameCount;
        let particleIndex = u32((f32(_arg_0.instanceIndex) / 20f));
        let trailIndexOriginal = (_arg_0.instanceIndex % 20u);
        let currentPosIndex = (frameCount2 % 20u);
        let trailIndex = (i32(((20u + currentPosIndex) - trailIndexOriginal)) % 20i);
        if ((trailIndexOriginal == 19u)) {
          return mainVertex_Output_3(vec4f(), vec2f(), 0f);
        }
        let particle = (&particles_4[particleIndex]);
        let iA = select(((trailIndex + 1i) % 20i), trailIndex, (trailIndexOriginal == 0u));
        let iB = trailIndex;
        let iC = (((20i + trailIndex) - 1i) % 20i);
        let iD = (((20i + trailIndex) - 2i) % 20i);
        var A = LineSegmentVertex_7((*particle).positions[iA], lineWidth_6((f32(trailIndexOriginal) / 19f)));
        var B = LineSegmentVertex_7((*particle).positions[iB], lineWidth_6((f32((trailIndexOriginal + 1u)) / 19f)));
        var C = LineSegmentVertex_7((*particle).positions[iC], lineWidth_6((f32((trailIndexOriginal + 2u)) / 19f)));
        var D = LineSegmentVertex_7((*particle).positions[iD], lineWidth_6((f32((trailIndexOriginal + 3u)) / 19f)));
        var result = lineSegmentVariableWidth_8(_arg_0.vertexIndex, A, B, C, D);
        return mainVertex_Output_3(vec4f(result.vertexPosition, 0f, 1f), result.vertexPosition, (f32(trailIndexOriginal) / 19f));
      }

      struct mainFragment_Input_39 {
        @location(0) position: vec2f,
        @location(1) trailPosition: f32,
      }

      @fragment fn mainFragment_38(_arg_0: mainFragment_Input_39) -> @location(0) vec4f {
        let opacity = clamp((3f * (1f - _arg_0.trailPosition)), 0f, 1f);
        return mix(vec4f(0.77f, 0.39f, 1f, opacity), vec4f(0.11f, 0.44f, 0.94f, opacity), ((_arg_0.position.x * 0.5f) + 0.5f));
      }"
    `);
  });
});
