/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockResizeObserver } from './utils/commonMocks.ts';

describe('lines combinations example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'geometry',
        name: 'lines-combinations',
        setupMocks: mockResizeObserver,
        expectedCalls: 14,
        controlTriggers: ['Test Resolution'],
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Uniforms {
        time: f32,
        fillType: u32,
      }

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      struct LineControlPoint {
        position: vec2f,
        radius: f32,
      }

      fn item(vertexIndex: u32, time: f32) -> LineControlPoint {
        let s = sin(time);
        let c = cos(time);
        const r = 0.25;
        var points = array<vec2f, 4>(vec2f(((r * s) - 0.25f), (r * c)), vec2f(-0.25, 0), vec2f(0.25, 0), vec2f(((-(r) * s) + 0.25f), (r * c)));
        let i = clamp((i32(vertexIndex) - 1i), 0i, 3i);
        return LineControlPoint(points[i], 0.2f);
      }

      struct mainVertex_Output {
        @builtin(position) outPos: vec4f,
        @location(0) position: vec2f,
        @location(1) uv: vec2f,
        @location(2) @interpolate(flat) instanceIndex: u32,
        @location(3) @interpolate(flat) vertexIndex: u32,
        @location(4) @interpolate(flat) situationIndex: u32,
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
            vertexPosition = round_1(join, joinVertexIndex, maxJoinCount);
          }
          else {
            vertexPosition = round_1(join, joinVertexIndex, maxJoinCount);
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

      @vertex fn mainVertex(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> mainVertex_Output {
        let t = uniforms.time;
        var A = item(instanceIndex, t);
        var B = item((instanceIndex + 1u), t);
        var C = item((instanceIndex + 2u), t);
        var D = item((instanceIndex + 3u), t);
        if (((((A.radius < 0f) || (B.radius < 0f)) || (C.radius < 0f)) || (D.radius < 0f))) {
          return mainVertex_Output();
        }
        var result = lineSegmentVariableWidth(vertexIndex, A, B, C, D, 6u);
        return mainVertex_Output(vec4f((result.vertexPosition * result.w), 0f, result.w), result.vertexPosition, vec2f(0f, select(0f, 1f, (vertexIndex > 1u))), instanceIndex, vertexIndex, 0u);
      }

      struct mainFragment_Input {
        @location(2) @interpolate(flat) instanceIndex: u32,
        @location(3) @interpolate(flat) vertexIndex: u32,
        @location(4) @interpolate(flat) situationIndex: u32,
        @location(0) position: vec2f,
        @location(1) uv: vec2f,
      }

      @fragment fn mainFragment(_arg_0: mainFragment_Input, @builtin(front_facing) frontFacing: bool, @builtin(position) screenPosition: vec4f) -> @location(0) vec4f {
        let fillType = uniforms.fillType;
        var color = vec3f();
        var colors = array<vec3f, 9>(vec3f(1, 0, 0), vec3f(0, 1, 0), vec3f(0, 0, 1), vec3f(1, 0, 1), vec3f(1, 1, 0), vec3f(0, 1, 1), vec3f(0.75, 0.25, 0.25), vec3f(0.25, 0.75, 0.25), vec3f(0.25, 0.25, 0.75));
        if ((fillType == 1u)) {
          color = mix(vec3f(0.7699999809265137, 0.38999998569488525, 1), vec3f(0.10999999940395355, 0.4399999976158142, 0.9399999976158142), ((_arg_0.position.x * 0.5f) + 0.5f));
        }
        if ((fillType == 2u)) {
          var t = cos((_arg_0.uv.y * 10f));
          t = clamp((t / fwidth(t)), 0f, 1f);
          color = mix(vec3f(0.7699999809265137, 0.38999998569488525, 1), vec3f(0.10999999940395355, 0.4399999976158142, 0.9399999976158142), t);
        }
        if ((fillType == 3u)) {
          color = colors[(_arg_0.vertexIndex % 9u)];
        }
        if ((fillType == 4u)) {
          color = colors[(_arg_0.instanceIndex % 9u)];
        }
        if ((fillType == 5u)) {
          color = colors[(_arg_0.situationIndex % 9u)];
        }
        color = (color * (0.8f + (0.2f * smoothstep(1f, 0.5f, _arg_0.uv.y))));
        if (frontFacing) {
          return vec4f(color, 0.5f);
        }
        return vec4f(color, select(0f, 1f, (((u32(screenPosition.x) >> 3u) % 2u) != ((u32(screenPosition.y) >> 3u) % 2u))));
      }"
    `);
  });
});
