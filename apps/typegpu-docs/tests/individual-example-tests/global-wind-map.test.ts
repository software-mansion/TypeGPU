/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('global wind map example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simulation',
        name: 'wind-map',
        expectedCalls: 2,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Uniforms {
        stepSize: f32,
        frameCount: u32,
      }

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      struct ParticleTrail {
        positions: array<vec2f, 20>,
      }

      @group(0) @binding(1) var<storage, read_write> particles: array<ParticleTrail>;

      fn vectorField(pos: vec2f) -> vec2f {
        return normalize(vec2f(-(pos.y), pos.x));
      }

      struct advectCompute_Input {
        @builtin(global_invocation_id) globalInvocationId: vec3u,
      }

      @compute @workgroup_size(64) fn advectCompute(_arg_0: advectCompute_Input) {
        let stepSize = uniforms.stepSize;
        let frameCount2 = uniforms.frameCount;
        let particleIndex = _arg_0.globalInvocationId.x;
        let particle = (&particles[particleIndex]);
        let currentPosIndex = (frameCount2 % 20u);
        let prevPosIndex = (((20u + frameCount2) - 1u) % 20u);
        let pos = (&(*particle).positions[prevPosIndex]);
        var v0 = vectorField((*pos));
        var v1 = vectorField(((*pos) + (v0 * (0.5f * stepSize))));
        var newPos = ((*pos) + (v1 * stepSize));
        (*particle).positions[currentPosIndex] = newPos;
        particles[particleIndex] = (*particle);
      }

      struct Uniforms {
        stepSize: f32,
        frameCount: u32,
      }

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      struct mainVertex_Output {
        @builtin(position) outPos: vec4f,
        @location(0) position: vec2f,
        @location(1) trailPosition: f32,
      }

      struct ParticleTrail {
        positions: array<vec2f, 20>,
      }

      @group(0) @binding(1) var<storage, read> particles: array<ParticleTrail>;

      fn lineWidth(x: f32) -> f32 {
        return (4e-3f * (1f - x));
      }

      struct LineControlPoint {
        position: vec2f,
        radius: f32,
      }

      struct LineSegmentOutput {
        vertexPosition: vec2f,
        w: f32,
      }

      struct ExternalNormals {
        nL: vec2f,
        nR: vec2f,
      }

      fn externalNormals(distance_1: vec2f, r1: f32, r2: f32) -> ExternalNormals {
        let dist2Inv = (1f / dot(distance_1, distance_1));
        let cosMulLen = (r1 - r2);
        let cosDivLen = (cosMulLen * dist2Inv);
        let sinDivLen = sqrt((max(0f, (1f - (cosMulLen * cosDivLen))) * dist2Inv));
        let a = (distance_1.x * cosDivLen);
        let b = (distance_1.y * sinDivLen);
        let c = (distance_1.x * sinDivLen);
        let d = (distance_1.y * cosDivLen);
        var nL = vec2f((a - b), (c + d));
        var nR = vec2f((a + b), (-(c) + d));
        return ExternalNormals(nL, nR);
      }

      fn miterPointNoCheck(a: vec2f, b: vec2f) -> vec2f {
        var ab = (a + b);
        return (ab * (2f / dot(ab, ab)));
      }

      struct JoinResult {
        dL: vec2f,
        dR: vec2f,
        shouldJoinL: bool,
        shouldJoinR: bool,
        isHairpin: bool,
      }

      fn solveJoin(AB: vec2f, BC: vec2f, eAB: ExternalNormals, eBC: ExternalNormals, joinLimit: f32, isCap: bool) -> JoinResult {
        let underLimitL = (dot(eAB.nL, BC) < joinLimit);
        let underLimitR = (dot(eAB.nR, BC) < joinLimit);
        let isHairpin = (((dot(AB, BC) < 0f) && (underLimitL == underLimitR)) || (dot(normalize(AB), normalize(BC)) < -0.99f));
        let tooCloseToJoinL = (dot(eAB.nL, eBC.nL) > 0.99f);
        let tooCloseToJoinR = (dot(eAB.nR, eBC.nR) > 0.99f);
        let shouldJoinL = (isHairpin || (underLimitL && !tooCloseToJoinL));
        let shouldJoinR = (isHairpin || (underLimitR && !tooCloseToJoinR));
        var dLMiter = miterPointNoCheck(eAB.nL, eBC.nL);
        var dRMiter = miterPointNoCheck(eBC.nR, eAB.nR);
        var dL = select(eBC.nL, dLMiter, (!isCap && !shouldJoinL));
        var dR = select(eBC.nR, dRMiter, (!isCap && !shouldJoinR));
        return JoinResult(dL, dR, shouldJoinL, shouldJoinR, isHairpin);
      }

      fn cross2d(a: vec2f, b: vec2f) -> f32 {
        return ((a.x * b.y) - (a.y * b.x));
      }

      struct Intersection {
        valid: bool,
        t: f32,
        point: vec2f,
      }

      fn intersectLines(A1: vec2f, A2: vec2f, B1: vec2f, B2: vec2f) -> Intersection {
        var a = (A2 - A1);
        var b = (B2 - B1);
        let axb = cross2d(a, b);
        var AB = (B1 - A1);
        let t = (cross2d(AB, b) / axb);
        return Intersection((((axb != 0f) && (t >= 0f)) && (t <= 1f)), t, (A1 + (a * t)));
      }

      struct JoinInput {
        C: LineControlPoint,
        v: vec2f,
        d: vec2f,
        fw: vec2f,
        start: vec2f,
        end: vec2f,
        shouldJoin: bool,
        isCap: bool,
      }

      fn rot90ccw(v: vec2f) -> vec2f {
        return vec2f(-(v.y), v.x);
      }

      fn arrow(join: JoinInput, joinVertexIndex: u32, _maxJoinCount: u32) -> vec2f {
        var bw = -(normalize(join.fw));
        var vert = rot90ccw(bw);
        let sgn = sign(cross2d(bw, join.d));
        var svert = (vert * sgn);
        var v0 = (svert + (bw * 7.5f));
        var v1 = (v0 + ((bw + svert) * 1.5f));
        if ((joinVertexIndex == 0u)) {
          return (join.C.position + (v0 * join.C.radius));
        }
        if ((joinVertexIndex == 1u)) {
          return (join.C.position + (v1 * join.C.radius));
        }
        return join.C.position;
      }

      fn butt(join: JoinInput, _joinVertexIndex: u32, _maxJoinCount: u32) -> vec2f {
        var fw = normalize(join.fw);
        var vert = rot90ccw(fw);
        let sgn = sign(cross2d(fw, join.d));
        var svert = (vert * sgn);
        return (join.C.position + (svert * join.C.radius));
      }

      fn rot90cw(v: vec2f) -> vec2f {
        return vec2f(v.y, -(v.x));
      }

      fn bisectCcw(a: vec2f, b: vec2f) -> vec2f {
        let sin_1 = cross2d(a, b);
        let sinSign = select(-1f, 1f, (sin_1 >= 0f));
        var orthoA = rot90ccw(a);
        var orthoB = rot90cw(b);
        var dir = select(((a + b) * sinSign), (orthoA + orthoB), (dot(a, b) < 0f));
        return normalize(dir);
      }

      fn bisectNoCheck(a: vec2f, b: vec2f) -> vec2f {
        return normalize((a + b));
      }

      fn slerpApprox(a: vec2f, b: vec2f, t: f32) -> vec2f {
        var mid = bisectNoCheck(a, b);
        var a_ = a;
        var b_ = mid;
        var t_ = (2f * t);
        if ((t > 0.5f)) {
          a_ = mid;
          b_ = b;
          t_ -= 1f;
        }
        return normalize(mix(a_, b_, t_));
      }

      fn round_1(join: JoinInput, joinVertexIndex: u32, maxJoinCount: u32) -> vec2f {
        if ((joinVertexIndex == 0u)) {
          return join.v;
        }
        var dir = slerpApprox(join.d, bisectCcw(join.start, join.end), (f32(joinVertexIndex) / f32(maxJoinCount)));
        return (join.C.position + (dir * join.C.radius));
      }

      fn lineSegmentVariableWidth(vertexIndex: u32, A: LineControlPoint, B: LineControlPoint, C: LineControlPoint, D: LineControlPoint, maxJoinCount: u32) -> LineSegmentOutput {
        var AB = (B.position - A.position);
        var BC = (C.position - B.position);
        var DC = (C.position - D.position);
        var CB = -(BC);
        let radiusABDelta = (A.radius - B.radius);
        let radiusBCDelta = (B.radius - C.radius);
        let radiusCDDelta = (C.radius - D.radius);
        if ((dot(BC, BC) <= (radiusBCDelta * radiusBCDelta))) {
          return LineSegmentOutput(vec2f(), 1f);
        }
        let isCapB = (dot(AB, AB) <= (radiusABDelta * radiusABDelta));
        let isCapC = (dot(DC, DC) <= (radiusCDDelta * radiusCDDelta));
        var eAB = externalNormals(AB, A.radius, B.radius);
        var eBC = externalNormals(BC, B.radius, C.radius);
        var eCB = ExternalNormals(eBC.nR, eBC.nL);
        var eDC = externalNormals(DC, D.radius, C.radius);
        let joinLimit = dot(eBC.nL, BC);
        var joinB = solveJoin(AB, BC, eAB, eBC, joinLimit, isCapB);
        var joinC = solveJoin(DC, CB, eDC, eCB, -(joinLimit), isCapC);
        let d2 = (&joinB.dL);
        let d3 = (&joinB.dR);
        let d4 = (&joinC.dL);
        let d5 = (&joinC.dR);
        var v2orig = (B.position + ((*d2) * B.radius));
        var v3orig = (B.position + ((*d3) * B.radius));
        var v4orig = (C.position + ((*d4) * C.radius));
        var v5orig = (C.position + ((*d5) * C.radius));
        var limL = intersectLines(B.position, v2orig, C.position, v5orig);
        var limR = intersectLines(B.position, v3orig, C.position, v4orig);
        var v2 = select(v2orig, limL.point, limL.valid);
        var v5 = select(v5orig, limL.point, limL.valid);
        var v3 = select(v3orig, limR.point, limR.valid);
        var v4 = select(v4orig, limR.point, limR.valid);
        if ((vertexIndex == 0u)) {
          return LineSegmentOutput(B.position, (1f / B.radius));
        }
        if ((vertexIndex == 1u)) {
          return LineSegmentOutput(C.position, (1f / C.radius));
        }
        let coreVertexIndex = ((vertexIndex - 2u) & 3u);
        let joinVertexIndex = ((vertexIndex - 2u) >> 2u);
        var join = JoinInput();
        if ((coreVertexIndex == 0u)) {
          join = JoinInput(B, v2, (*d2), CB, (*d2), select(eAB.nL, (*d3), (joinB.isHairpin || isCapB)), joinB.shouldJoinL, isCapB);
        }
        else {
          if ((coreVertexIndex == 1u)) {
            join = JoinInput(B, v3, (*d3), CB, select(eAB.nR, (*d2), (joinB.isHairpin || isCapB)), (*d3), joinB.shouldJoinR, isCapB);
          }
          else {
            if ((coreVertexIndex == 2u)) {
              join = JoinInput(C, v4, (*d4), BC, (*d4), select(eDC.nL, (*d5), (joinC.isHairpin || isCapC)), joinC.shouldJoinL, isCapC);
            }
            else {
              join = JoinInput(C, v5, (*d5), BC, select(eDC.nR, (*d4), (joinC.isHairpin || isCapC)), (*d5), joinC.shouldJoinR, isCapC);
            }
          }
        }
        var vertexPosition = join.v;
        if (join.isCap) {
          if ((coreVertexIndex < 2u)) {
            vertexPosition = arrow(join, joinVertexIndex, maxJoinCount);
          }
          else {
            vertexPosition = butt(join, joinVertexIndex, maxJoinCount);
          }
        }
        else {
          if (join.shouldJoin) {
            vertexPosition = round_1(join, joinVertexIndex, maxJoinCount);
          }
        }
        let w = select((1f / B.radius), (1f / C.radius), (coreVertexIndex >= 2u));
        return LineSegmentOutput(vertexPosition, w);
      }

      struct mainVertex_Input {
        @builtin(instance_index) instanceIndex: u32,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertex(_arg_0: mainVertex_Input) -> mainVertex_Output {
        let frameCount2 = uniforms.frameCount;
        let particleIndex = u32((f32(_arg_0.instanceIndex) / 20f));
        let trailIndexOriginal = (_arg_0.instanceIndex % 20u);
        let currentPosIndex = (frameCount2 % 20u);
        let trailIndex = (i32(((20u + currentPosIndex) - trailIndexOriginal)) % 20i);
        if ((trailIndexOriginal == 19u)) {
          return mainVertex_Output(vec4f(), vec2f(), 0f);
        }
        let particle = (&particles[particleIndex]);
        let iA = select(((trailIndex + 1i) % 20i), trailIndex, (trailIndexOriginal == 0u));
        let iB = trailIndex;
        let iC = (((20i + trailIndex) - 1i) % 20i);
        let iD = (((20i + trailIndex) - 2i) % 20i);
        var A = LineControlPoint((*particle).positions[iA], lineWidth((f32(trailIndexOriginal) / 19f)));
        var B = LineControlPoint((*particle).positions[iB], lineWidth((f32((trailIndexOriginal + 1u)) / 19f)));
        var C = LineControlPoint((*particle).positions[iC], lineWidth((f32((trailIndexOriginal + 2u)) / 19f)));
        var D = LineControlPoint((*particle).positions[iD], lineWidth((f32((trailIndexOriginal + 3u)) / 19f)));
        var result = lineSegmentVariableWidth(_arg_0.vertexIndex, A, B, C, D, 3u);
        return mainVertex_Output(vec4f(result.vertexPosition, 0f, 1f), result.vertexPosition, (f32(trailIndexOriginal) / 19f));
      }

      struct mainFragment_Input {
        @location(0) position: vec2f,
        @location(1) trailPosition: f32,
      }

      @fragment fn mainFragment(_arg_0: mainFragment_Input) -> @location(0) vec4f {
        let opacity = clamp((3f * (1f - _arg_0.trailPosition)), 0f, 1f);
        return mix(vec4f(0.77f, 0.39f, 1f, opacity), vec4f(0.11f, 0.44f, 0.94f, opacity), ((_arg_0.position.x * 0.5f) + 0.5f));
      }"
    `);
  });
});
