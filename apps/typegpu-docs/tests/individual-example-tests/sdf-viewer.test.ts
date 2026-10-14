/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockResizeObserver } from './utils/commonMocks.ts';

describe('sdf viewer example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'sdf-viewer',
        expectedCalls: 1,
        setupMocks: () => {
          mockResizeObserver();
        },
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct vertexMain_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn vertexMain(@builtin(vertex_index) vertexIndex: u32) -> vertexMain_Output {
        let pos = array<vec2f, 3>(vec2f(-1), vec2f(3, -1), vec2f(-1, 3));
        return vertexMain_Output(vec4f(pos[vertexIndex], 0f, 1f), pos[vertexIndex]);
      }

      struct Camera {
        pos: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
        viewInverse: mat4x4f,
        projectionInverse: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform: Camera;

      struct Ray {
        origin: vec3f,
        direction: vec3f,
      }

      fn getRayForUV(uv: vec2f) -> Ray {
        let camera = (&cameraUniform);
        let farView = ((*camera).projectionInverse * vec4f(uv, 1f, 1f));
        let farWorld = ((*camera).viewInverse * vec4f((farView.xyz / farView.w), 1f));
        return Ray((*camera).pos.xyz, normalize((farWorld.xyz - (*camera).pos.xyz)));
      }

      struct Shape {
        color: vec3f,
        dist: f32,
      }

      fn checkerBoard(uv: vec2f) -> f32 {
        let fuv = floor(uv);
        return (abs((fuv.x + fuv.y)) % 2f);
      }

      fn sdPlane(point: vec3f, normal: vec3f, height: f32) -> f32 {
        return (dot(point, normal) + height);
      }

      fn palette(index: i32) -> vec3f {
        let t = (f32(index) * 0.618034f);
        return (vec3f(0.5) + (0.4f * cos((6.28318f * (vec3f(t) + vec3f(0, 0.33000001311302185, 0.6700000166893005))))));
      }

      fn slot(index: i32, count: i32, z: i32) -> vec3f {
        return vec3f(((f32(index) - (f32((count - 1i)) * 0.5f)) * 3f), 1.2f, f32(z));
      }

      fn sdSphere(point: vec3f, radius: f32) -> f32 {
        return (length(point) - radius);
      }

      fn sdBox3d(point: vec3f, size: vec3f) -> f32 {
        let d = (abs(point) - size);
        return (length(max(d, vec3f())) + min(max(max(d.x, d.y), d.z), 0f));
      }

      fn shapeUnion(a: Shape, b: Shape) -> Shape {
        return Shape(select(a.color, b.color, (a.dist > b.dist)), min(a.dist, b.dist));
      }

      fn sdRoundedBox3d(point: vec3f, size: vec3f, cornerRadius: f32) -> f32 {
        let d = ((abs(point) - size) + vec3f(cornerRadius));
        return ((length(max(d, vec3f())) + min(max(max(d.x, d.y), d.z), 0f)) - cornerRadius);
      }

      fn sdBoxFrame3d(point: vec3f, size: vec3f, thickness: f32) -> f32 {
        let p1 = (abs(point) - size);
        let q = (abs((p1 + thickness)) - vec3f(thickness));
        let d1 = (length(max(vec3f(p1.x, q.y, q.z), vec3f())) + min(max(p1.x, max(q.y, q.z)), 0f));
        let d2 = (length(max(vec3f(q.x, p1.y, q.z), vec3f())) + min(max(q.x, max(p1.y, q.z)), 0f));
        let d3 = (length(max(vec3f(q.x, q.y, p1.z), vec3f())) + min(max(q.x, max(q.y, p1.z)), 0f));
        return min(min(d1, d2), d3);
      }

      fn sdCapsule(point: vec3f, A: vec3f, B: vec3f, radius: f32) -> f32 {
        let pa = (point - A);
        let ba = (B - A);
        let h = saturate((dot(pa, ba) / dot(ba, ba)));
        return (distance(pa, (ba * h)) - radius);
      }

      fn sdCappedCylinder(p: vec3f, r: f32, h: f32) -> f32 {
        let dd = (abs(vec2f(length(p.xz), p.y)) - vec2f(r, h));
        return (min(max(dd.x, dd.y), 0f) + length(max(dd, vec2f())));
      }

      fn ndot(a: vec2f, b: vec2f) -> f32 {
        return ((a.x * b.x) - (a.y * b.y));
      }

      fn dot2(a: vec2f) -> f32 {
        return dot(a, a);
      }

      fn sdRhombus3d(p: vec3f, la: f32, lb: f32, h: f32, ra: f32) -> f32 {
        let ap = abs(p);
        let b = vec2f(la, lb);
        let f = clamp((ndot(b, (b - (ap.xz * 2f))) / dot2(b)), -1f, 1f);
        let q = vec2f(((length((ap.xz - ((b * vec2f((1f - f), (1f + f))) * 0.5f))) * sign((((ap.x * b.y) + (ap.z * b.x)) - (b.x * b.y)))) - ra), (ap.y - h));
        return (min(max(q.x, q.y), 0f) + length(max(q, vec2f())));
      }

      fn sdLine3d(point: vec3f, A: vec3f, B: vec3f) -> f32 {
        let pa = (point - A);
        let ba = (B - A);
        let h = max(0f, min(1f, (dot(pa, ba) / dot(ba, ba))));
        return distance(pa, (ba * h));
      }

      fn dot2_1(a: vec3f) -> f32 {
        return dot(a, a);
      }

      fn sdTriangle3d(p: vec3f, a: vec3f, b: vec3f, c: vec3f) -> f32 {
        let ba = (b - a);
        let pa = (p - a);
        let cb = (c - b);
        let pb = (p - b);
        let ac = (a - c);
        let pc = (p - c);
        let nor = cross(ba, ac);
        let cond = (((sign(dot(cross(ba, nor), pa)) + sign(dot(cross(cb, nor), pb))) + sign(dot(cross(ac, nor), pc))) < 2f);
        return sqrt(select(((dot(nor, pa) * dot(nor, pa)) / dot2_1(nor)), min(min(dot2_1(((ba * saturate((dot(ba, pa) / dot2_1(ba)))) - pa)), dot2_1(((cb * saturate((dot(cb, pb) / dot2_1(cb)))) - pb))), dot2_1(((ac * saturate((dot(ac, pc) / dot2_1(ac)))) - pc))), cond));
      }

      fn sdTorus(point: vec3f, majorRadius: f32, minorRadius: f32) -> f32 {
        let q = vec2f((length(point.xz) - majorRadius), point.y);
        return (length(q) - minorRadius);
      }

      fn sdCappedTorus(point: vec3f, sc: vec2f, majorRadius: f32, minorRadius: f32) -> f32 {
        let p = vec3f(abs(point.x), point.yz);
        let dist = select(length(vec2f((length(p.xy) - majorRadius), p.z)), length(vec3f((p.xy - (sc * majorRadius)), p.z)), ((sc.y * p.x) > (sc.x * p.y)));
        return (dist - minorRadius);
      }

      fn shapes3d(p: vec3f) -> Shape {
        const count = 11;
        var res = Shape(palette(0i), sdSphere((p - slot(0i, count, 0i)), 0.8f));
        res = shapeUnion(res, Shape(palette(1i), sdBox3d((p - slot(1i, count, 0i)), vec3f(0.699999988079071))));
        res = shapeUnion(res, Shape(palette(2i), sdRoundedBox3d((p - slot(2i, count, 0i)), vec3f(0.699999988079071), 0.2f)));
        res = shapeUnion(res, Shape(palette(3i), sdBoxFrame3d((p - slot(3i, count, 0i)), vec3f(0.699999988079071), 0.08f)));
        res = shapeUnion(res, Shape(palette(4i), sdCapsule((p - slot(4i, count, 0i)), vec3f(0, -0.6000000238418579, 0), vec3f(0, 0.6000000238418579, 0), 0.4f)));
        res = shapeUnion(res, Shape(palette(5i), sdCappedCylinder((p - slot(5i, count, 0i)), 0.6f, 0.8f)));
        res = shapeUnion(res, Shape(palette(6i), sdRhombus3d((p - slot(6i, count, 0i)), 0.8f, 0.5f, 0.3f, 0.05f)));
        res = shapeUnion(res, Shape(palette(7i), (sdLine3d((p - slot(7i, count, 0i)), vec3f(-0.6000000238418579, -0.6000000238418579, 0), vec3f(0.6000000238418579, 0.6000000238418579, 0)) - 0.06f)));
        res = shapeUnion(res, Shape(palette(8i), (sdTriangle3d((p - slot(8i, count, 0i)), vec3f(-0.699999988079071, -0.6000000238418579, 0), vec3f(0.699999988079071, -0.6000000238418579, 0), vec3f(0, 0.699999988079071, 0)) - 0.06f)));
        let torusP = (p - slot(9i, count, 0i));
        res = shapeUnion(res, Shape(palette(9i), sdTorus(torusP.xzy, 0.6f, 0.2f)));
        res = shapeUnion(res, Shape(palette(10i), sdCappedTorus((p - slot(10i, count, 0i)), vec2f(0.8084964156150818, -0.5885010957717896), 0.6f, 0.15f)));
        return res;
      }

      fn sdDisk(point: vec2f, radius: f32) -> f32 {
        return (length(point) - radius);
      }

      fn opExtrudeZ(point: vec3f, dd: f32, halfHeight: f32) -> f32 {
        let w = vec2f(dd, (abs(point.z) - halfHeight));
        return (min(max(w.x, w.y), 0f) + length(max(w, vec2f())));
      }

      fn sdBox2d(point: vec2f, size: vec2f) -> f32 {
        let d = (abs(point) - size);
        return (length(max(d, vec2f())) + min(max(d.x, d.y), 0f));
      }

      fn sdRoundedBox2d(point: vec2f, size: vec2f, cornerRadius: f32) -> f32 {
        let d = ((abs(point) - size) + vec2f(cornerRadius));
        return ((length(max(d, vec2f())) + min(max(d.x, d.y), 0f)) - cornerRadius);
      }

      fn sdPie(point: vec2f, sc: vec2f, radius: f32) -> f32 {
        var p_w = point;
        p_w.x = abs(point.x);
        let l = (length(p_w) - radius);
        let m = distance(p_w, (sc * clamp(dot(p_w, sc), 0f, radius)));
        return max(l, (m * sign(((sc.y * p_w.x) - (sc.x * p_w.y)))));
      }

      fn sdArc(position: vec2f, sc: vec2f, radius: f32) -> f32 {
        let pos = vec2f(abs(position.x), position.y);
        if (((sc.y * pos.x) > (sc.x * pos.y))) {
          return length((pos - (sc * radius)));
        }
        return abs((length(pos) - radius));
      }

      fn sdLine(point: vec2f, A: vec2f, B: vec2f) -> f32 {
        let pa = (point - A);
        let ba = (B - A);
        let h = max(0f, min(1f, (dot(pa, ba) / dot(ba, ba))));
        return distance(pa, (ba * h));
      }

      fn dot2_2(v: vec2f) -> f32 {
        return dot(v, v);
      }

      fn sdBezier(point: vec2f, A: vec2f, B: vec2f, C: vec2f) -> f32 {
        let a = (B - A);
        let b = ((A - (B * 2f)) + C);
        let c = (a * 2f);
        let d = (A - point);
        let dotB = max(dot(b, b), 1e-4f);
        let kk = (1f / dotB);
        let kx = (kk * dot(a, b));
        let ky = ((kk * ((2f * dot(a, a)) + dot(d, b))) / 3f);
        let kz = (kk * dot(d, a));
        var res = 0f;
        let p = (ky - (kx * kx));
        let p3 = ((p * p) * p);
        let q = ((kx * (((2f * kx) * kx) - (3f * ky))) + kz);
        var h = ((q * q) + (4f * p3));
        if ((h >= 0f)) {
          h = sqrt(h);
          let x = ((vec2f(h, -(h)) - q) * 0.5f);
          let uv = (sign(x) * pow(abs(x), vec2f(0.3333333432674408)));
          let t = saturate(((uv.x + uv.y) - kx));
          res = dot2_2((d + ((c + (b * t)) * t)));
        }
        else {
          let z = sqrt(-(p));
          let v = (acos((q / ((p * z) * 2f))) / 3f);
          let m = cos(v);
          let n = (sin(v) * 1.732050808f);
          let t = saturate(((vec3f((m + m), (-(n) - m), (n - m)) * z) - kx));
          res = min(dot2_2((d + ((c + (b * t.x)) * t.x))), dot2_2((d + ((c + (b * t.y)) * t.y))));
        }
        return sqrt(res);
      }

      fn cross_1(a: vec2f, b: vec2f) -> f32 {
        return ((a.x * b.y) - (a.y * b.x));
      }

      fn sdBezierApprox(point: vec2f, A: vec2f, B: vec2f, C: vec2f) -> f32 {
        let i = (A - C);
        let j = (C - B);
        let k = (B - A);
        let w = (j - k);
        let v0 = (A - point);
        let v1 = (B - point);
        let v2 = (C - point);
        let x = cross_1(v0, v2);
        let y = cross_1(v1, v0);
        let z = cross_1(v2, v1);
        let s = ((((j * y) + (k * z)) * 2f) - (i * x));
        let r = (((y * z) - ((x * x) * 0.25f)) / dot2_2(s));
        let t = saturate(((((0.5f * x) + y) + (r * dot(s, w))) / ((x + y) + z)));
        let d = (v0 + (((2f * k) + (w * t)) * t));
        return length(d);
      }

      fn sdHexagon2d(point: vec2f, radius: f32) -> f32 {
        let k = vec3f(-0.8660253882408142, 0.5, 0.5773502588272095);
        var p = abs(point);
        p -= (k.xy * (2f * min(dot(k.xy, p), 0f)));
        p -= vec2f(clamp(p.x, (-(k.z) * radius), (k.z * radius)), radius);
        return (length(p) * sign(p.y));
      }

      fn shapes2d(p: vec3f) -> Shape {
        const count = 9;
        const z = 4;
        const depth = 0.2;
        var q = (p - slot(0i, count, z));
        var res = Shape(palette(11i), opExtrudeZ(q, sdDisk(q.xy, 0.8f), depth));
        q = (p - slot(1i, count, z));
        res = shapeUnion(res, Shape(palette(12i), opExtrudeZ(q, sdBox2d(q.xy, vec2f(0.699999988079071)), depth)));
        q = (p - slot(2i, count, z));
        res = shapeUnion(res, Shape(palette(13i), opExtrudeZ(q, sdRoundedBox2d(q.xy, vec2f(0.699999988079071), 0.25f), depth)));
        q = (p - slot(3i, count, z));
        res = shapeUnion(res, Shape(palette(14i), opExtrudeZ(q, sdPie(q.xy, vec2f(0.8414709568023682, 0.5403022766113281), 0.8f), depth)));
        q = (p - slot(4i, count, z));
        res = shapeUnion(res, Shape(palette(15i), opExtrudeZ(q, (sdArc(q.xy, vec2f(0.9092974066734314, -0.416146844625473), 0.7f) - 0.06f), depth)));
        q = (p - slot(5i, count, z));
        res = shapeUnion(res, Shape(palette(16i), opExtrudeZ(q, (sdLine(q.xy, vec2f(-0.6000000238418579), vec2f(0.6000000238418579)) - 0.06f), depth)));
        q = (p - slot(6i, count, z));
        res = shapeUnion(res, Shape(palette(17i), opExtrudeZ(q, (sdBezier(q.xy, vec2f(-0.699999988079071, -0.6000000238418579), vec2f(0, 1.2000000476837158), vec2f(0.699999988079071, -0.6000000238418579)) - 0.06f), depth)));
        q = (p - slot(7i, count, z));
        res = shapeUnion(res, Shape(palette(18i), opExtrudeZ(q, (sdBezierApprox(q.xy, vec2f(-0.699999988079071, -0.6000000238418579), vec2f(0, 1.2000000476837158), vec2f(0.699999988079071, -0.6000000238418579)) - 0.06f), depth)));
        q = (p - slot(8i, count, z));
        res = shapeUnion(res, Shape(palette(19i), opExtrudeZ(q, sdHexagon2d(q.xy, 0.7f), depth)));
        return res;
      }

      fn getSceneDist(p: vec3f) -> Shape {
        let floor_1 = Shape(mix(vec3f(1), vec3f(0.30000001192092896), checkerBoard((p.xz * 0.5f))), sdPlane(p, vec3f(0, 1, 0), 0f));
        return shapeUnion(shapeUnion(shapes3d(p), shapes2d(p)), floor_1);
      }

      fn rayMarch(ro: vec3f, rd: vec3f) -> Shape {
        var dO = 0f;
        var result = Shape(vec3f(0.699999988079071, 0.800000011920929, 0.8999999761581421), 80f);
        for (var i = 0; (i < 256i); i++) {
          let scene = getSceneDist((ro + (rd * dO)));
          dO += scene.dist;
          if (((dO > 80f) || (scene.dist < 1e-3f))) {
            result.dist = dO;
            result.color = scene.color;
            break;
          }
        }
        return result;
      }

      fn getNormal(p: vec3f) -> vec3f {
        let dist = getSceneDist(p).dist;
        const e = 1e-3;
        return normalize(vec3f((getSceneDist((p + vec3f(e, 0f, 0f))).dist - dist), (getSceneDist((p + vec3f(0f, e, 0f))).dist - dist), (getSceneDist((p + vec3f(0f, 0f, e))).dist - dist)));
      }

      struct fragmentMain_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain(_arg_0: fragmentMain_Input) -> @location(0) vec4f {
        let ray = getRayForUV(_arg_0.uv);
        let march = rayMarch(ray.origin, ray.direction);
        if ((march.dist >= 80f)) {
          return vec4f(0.699999988079071, 0.800000011920929, 0.8999999761581421, 1);
        }
        let p = (ray.origin + (ray.direction * march.dist));
        let n = getNormal(p);
        let lightDir = vec3f(-0.37904903292655945, 0.7580980658531189, -0.5306686162948608);
        let diffuse = max(dot(n, lightDir), 0f);
        let color = (march.color * ((diffuse * 0.8f) + 0.2f));
        let fog = pow((march.dist / 80f), 2f);
        return vec4f(mix(color, vec3f(0.699999988079071, 0.800000011920929, 0.8999999761581421), fog), 1f);
      }"
    `);
  });
});
