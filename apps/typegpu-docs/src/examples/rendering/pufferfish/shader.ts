import { randf } from '@typegpu/noise';
import * as sdf from '@typegpu/sdf';
import tgpu, { type TgpuFixedSampler } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const frequentLayout = tgpu.bindGroupLayout({
  video: { externalTexture: d.textureExternal() },
});

/**
 * Holds custom parameters that can be sent to the shader via Smelter
 */
export const Uniforms = d.struct({
  invProjMat: d.mat4x4f,
  invModelMat: d.mat4x4f,
  /**
   * RGB is the fish's color.
   *
   * The alpha channel is used for the fish's immunity.
   * 0-1 value (usually either 0 or 1).
   * 0 means no immunity, 1 means full immunity.
   */
  color: d.vec4f,
  /**
   * xy - 2d min point of the bounding box
   * zw - 2d max point of the bounding box
   */
  face_oval: d.vec4f,
  spike_height: d.f32,
  head_yaw: d.f32,
  head_pitch: d.f32,
  time: d.f32,
});

export const uniformsAccess = tgpu['~unstable'].accessor(Uniforms);
export const samplerSlot = tgpu.slot<TgpuFixedSampler>();

const MAX_STEPS = 1000;
const MAX_DIST = 30.0;
const SURF_DIST = 0.001;

const bodyRadiusAccess = tgpu['~unstable'].accessor(d.f32, 0.6);
const bodyPositionAccess = tgpu['~unstable'].accessor(
  d.vec3f,
  d.vec3f(0, 0, 2.5),
);
const cameraRollAccess = tgpu['~unstable'].accessor(d.f32, 0);

// Structure to hold both distance and color
const Shape = d.struct({
  color: d.vec3f,
  dist: d.f32,
});
type Shape = d.Infer<typeof Shape>;

const sdEllipsoid = (p: d.v3f, r: d.v3f): number => {
  'use gpu';
  const k0 = std.length(p.div(r));
  const k1 = std.length(p.div(r.mul(r)));
  return (k0 * (k0 - 1.0)) / k1;
};

const sdCone = (p: d.v3f, c: d.v2f, h: number): number => {
  'use gpu';
  const q = d.vec2f(c.x / c.y, -1).mul(h);
  const w = d.vec2f(std.length(p.xz), p.y);
  const a = w.sub(q.mul(std.clamp(std.dot(w, q) / std.dot(q, q), 0, 1)));
  const b = w.sub(q.mul(d.vec2f(std.clamp(w.x / q.x, 0, 1), 1)));
  const k = std.sign(q.y);
  const dd = std.min(std.dot(a, a), std.dot(b, b));
  const s = std.max(k * (w.x * q.y - w.y * q.x), k * (w.y - q.y));
  return std.sqrt(dd) * std.sign(s);
};

const dot2 = (a: d.v3f): number => {
  'use gpu';
  return std.dot(a, a);
};

const udTriangle = (p: d.v3f, a: d.v3f, b: d.v3f, c: d.v3f): number => {
  'use gpu';
  const ba = b.sub(a);
  const pa = p.sub(a);
  const cb = c.sub(b);
  const pb = p.sub(b);
  const ac = a.sub(c);
  const pc = p.sub(c);
  const nor = std.cross(ba, ac);
  const condition = std.sign(std.dot(std.cross(ba, nor), pa)) +
      std.sign(std.dot(std.cross(cb, nor), pb)) +
      std.sign(std.dot(std.cross(ac, nor), pc)) <
    2;
  if (condition) {
    return std.sqrt(
      std.min(
        std.min(
          dot2(ba.mul(std.clamp(std.dot(ba, pa) / dot2(ba), 0, 1)).sub(pa)),
          dot2(cb.mul(std.clamp(std.dot(cb, pb) / dot2(cb), 0, 1)).sub(pb)),
        ),
        dot2(ac.mul(std.clamp(std.dot(ac, pc) / dot2(ac), 0, 1)).sub(pc)),
      ),
    );
  } else {
    return std.sqrt((std.dot(nor, pa) * std.dot(nor, pa)) / dot2(nor));
  }
};

const shapeUnion = (a: Shape, b: Shape): Shape => {
  'use gpu';
  const result = Shape();
  if (a.dist < b.dist) {
    result.dist = a.dist;
    result.color = d.vec3f(a.color);
  } else {
    result.dist = b.dist;
    result.color = d.vec3f(b.color);
  }
  return result;
};

const smoothShapeUnion = (a: Shape, b: Shape, k: number): Shape => {
  'use gpu';
  const h = std.max(k - std.abs(a.dist - b.dist), 0.0) / k;
  const m = h * h;

  const dist = std.min(a.dist, b.dist) - m * k * 0.25;

  let weight = d.f32();
  if (a.dist > b.dist) {
    weight = 1.0 - m;
  } else {
    weight = m;
  }

  const color = std.mix(a.color, b.color, weight);

  return Shape({ color, dist });
};

const minPufferfishDist = tgpu.privateVar(d.f32, MAX_DIST);
const lastPufferfishDist = tgpu.privateVar(d.f32, MAX_DIST);

// Get pufferfish SDF with spikes and eyes
const getPufferfish = (p: d.v3f): Shape => {
  'use gpu';
  const time = uniformsAccess.$.time;
  const bodyRadius = bodyRadiusAccess.$;
  const bodyPosition = bodyPositionAccess.$;

  // Body ellipsoid
  const bodyColor = uniformsAccess.$.color.xyz;
  const bodyRadii = d.vec3f(bodyRadius);
  const bodyLocalP = p.sub(bodyPosition);
  const mainBody = sdEllipsoid(bodyLocalP, bodyRadii);
  let fishBody = Shape({
    color: bodyColor,
    dist: mainBody,
  });

  // Spikes
  const spikeHeight = uniformsAccess.$.spike_height;
  const spikeFreq = 16;
  // Changing the coordinate system into something more cylindrical
  const yaw = (std.atan2(bodyLocalP.y, bodyLocalP.x) / (Math.PI * 2)) *
    spikeFreq;
  const pitch = bodyLocalP.z;
  const fyaw = std.fract(yaw) - 0.5;
  const idx = std.floor(yaw);
  const surfDist = std.length(bodyLocalP) - bodyRadius;

  randf.seed(idx * 0.1);
  const spikeAngle = std.radians(40.0);
  const spikeConeC = d.vec2f(std.sin(spikeAngle), std.cos(spikeAngle));
  const height = spikeHeight * (0.7 + randf.sample() * 0.3);
  const spikeDist = sdCone(
    d.vec3f(fyaw, surfDist - height / 2, pitch),
    spikeConeC,
    height,
  );
  fishBody.dist = sdf.opSmoothUnion(fishBody.dist, spikeDist, 0.03);

  // Fins
  const finLength = 0.2;
  const finYOffset = 0.3;
  const finXOffset = 0.2;
  const finAnimationFreq = -3;
  const leftFinXOffset = std.sin(time * finAnimationFreq) * 0.05;
  const leftFinYOffset = std.cos(time * finAnimationFreq) * 0.1;
  const leftFinZTwist = std.sin(time * finAnimationFreq) * 0.2;
  const leftFinA = d.vec3f(
    bodyPosition.x + (bodyRadii.x + finLength) + leftFinXOffset,
    bodyPosition.y + finYOffset + leftFinYOffset,
    bodyPosition.z + leftFinZTwist,
  );
  const leftFinB = d.vec3f(
    bodyPosition.x + (bodyRadii.x - finXOffset),
    bodyPosition.y,
    bodyPosition.z,
  );
  const leftFinC = d.vec3f(
    bodyPosition.x + (bodyRadii.x + finLength) + leftFinXOffset,
    bodyPosition.y - finYOffset + leftFinYOffset,
    bodyPosition.z - leftFinZTwist,
  );
  const leftFin = Shape({
    color: bodyColor,
    dist: udTriangle(p, leftFinA, leftFinB, leftFinC) - 0.05,
  });
  const rightFinXOffset = std.cos(time * finAnimationFreq) * 0.05;
  const rightFinYOffset = std.sin(time * finAnimationFreq) * 0.1;
  const rightFinZTwist = std.cos(time * finAnimationFreq) * 0.2;
  const rightFinA = d.vec3f(
    bodyPosition.x - (bodyRadii.x + finLength) + rightFinXOffset,
    bodyPosition.y + finYOffset + rightFinYOffset,
    bodyPosition.z + rightFinZTwist,
  );
  const rightFinB = d.vec3f(
    bodyPosition.x - (bodyRadii.x - finXOffset),
    bodyPosition.y,
    bodyPosition.z,
  );
  const rightFinC = d.vec3f(
    bodyPosition.x - (bodyRadii.x + finLength) + rightFinXOffset,
    bodyPosition.y - finYOffset + rightFinYOffset,
    bodyPosition.z - rightFinZTwist,
  );
  const rightFin = Shape({
    color: bodyColor,
    dist: udTriangle(p, rightFinA, rightFinB, rightFinC) - 0.05,
  });
  const fins = shapeUnion(leftFin, rightFin);
  fishBody = smoothShapeUnion(fishBody, fins, 0.03);

  // Recording min distance
  if (fishBody.dist < minPufferfishDist.$) {
    minPufferfishDist.$ = fishBody.dist;
  }
  lastPufferfishDist.$ = fishBody.dist;

  return fishBody;
};

// Ray marching function
const rayMarch = (ro: d.v3f, rd: d.v3f): Shape => {
  'use gpu';
  let dO = d.f32();
  const result = Shape({ color: d.vec3f(), dist: MAX_DIST });

  for (let i = d.i32(0); i < MAX_STEPS; i++) {
    const p = ro.add(rd.mul(dO));
    const scene = getPufferfish(p);
    dO += scene.dist;

    if (dO > MAX_DIST || scene.dist < SURF_DIST) {
      result.dist = dO;
      result.color = d.vec3f(scene.color);
      break;
    }
  }

  return result;
};

const getNormal = (p: d.v3f): d.v3f => {
  'use gpu';
  const dist = getPufferfish(p).dist;
  const e = 0.01;

  const n = d.vec3f(
    getPufferfish(p.add(d.vec3f(e, 0, 0))).dist - dist,
    getPufferfish(p.add(d.vec3f(0, e, 0))).dist - dist,
    getPufferfish(p.add(d.vec3f(0, 0, e))).dist - dist,
  );

  return std.normalize(n);
};

export const fullColorFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f, coord: d.builtin.position },
  out: d.vec4f,
})((input) => {
  'use gpu';
  const uv = input.uv.mul(2).sub(1);
  const bodyPosition = bodyPositionAccess.$;
  const faceOval = uniformsAccess.$.face_oval;
  // Ray setup
  const suv = uniformsAccess.$.invProjMat.mul(d.vec4f(uv, 0, 1)).xy;
  let ro = d.vec3f(suv, 0);
  let rd = uniformsAccess.$.invProjMat.mul(d.vec4f(0, 0, 1, 0)).xyz;

  // Transforming around the pufferfish
  ro = uniformsAccess.$.invModelMat.mul(
    d.vec4f(ro.sub(bodyPosition), 1),
  ).xyz.add(bodyPosition);
  rd = uniformsAccess.$.invModelMat.mul(d.vec4f(rd, 0)).xyz;

  // Ray march
  const march = rayMarch(ro, rd);
  const distance = march.dist;
  const hitPos = ro.add(rd.mul(distance));

  let textureUV = d.vec2f();
  let normal = d.vec3f();
  let blendFactor = d.f32();
  /**
   * The (inverse) size of the face in the cutout
   */
  const faceSize = 1.8;
  const faceUv = suv.mul(faceSize).mul(0.5).add(0.5);
  // Flip the x axis
  faceUv.x = 1.0 - faceUv.x;

  if (distance < MAX_DIST) {
    // Hit the pufferfish
    // const localPos = hitPos.sub(bodyPosition);
    normal = std.normalize(getNormal(hitPos));
    const smoothNormal = std.normalize(hitPos.sub(bodyPosition));

    // Face fish mode logic
    const maskOuterThreshold = 0.3;
    const maskInnerThreshold = 0.8;
    blendFactor = std.smoothstep(
      maskOuterThreshold,
      maskInnerThreshold,
      -smoothNormal.z,
    );
    textureUV = std.mix(faceOval.xy, faceOval.zw, faceUv);
  }

  const textureColor = std.textureSampleBaseClampToEdge(
    frequentLayout.$.video,
    samplerSlot.$,
    textureUV,
  );
  let result = d.vec4f();

  if (distance < MAX_DIST) {
    // Lighting
    const lightDir = std.normalize(d.vec3f(0.0, -1, -0.5)); // Light comes from the top
    const att = std.clamp(std.dot(normal, lightDir) * 5, 0, 1);
    const diffuseLight = d.vec3f(att * 0.6);
    const ambientLight = d.vec3f(0.4, 0.45, 0.5);
    const litFishColor = march.color.mul(diffuseLight.add(ambientLight));

    const finalColor = std.mix(litFishColor, textureColor.xyz, blendFactor);

    result = d.vec4f(finalColor, 1);
  } else {
    // Background
    result = d.vec4f();
  }

  // Outline
  const outlineThickness = 0.02;
  if (
    minPufferfishDist.$ < outlineThickness &&
    lastPufferfishDist.$ >= MAX_DIST * 0.1
  ) {
    result = d.vec4f(0, 0, 0, 1);
  }

  // Pulsating when immune
  const immunity = uniformsAccess.$.color.w;
  result = result.mul(
    std.mix(1, std.sin(uniformsAccess.$.time * 10) * 0.05 + 0.4, immunity),
  );

  return result;
});

export const sdfDebugFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f, coord: d.builtin.position },
  out: d.vec4f,
})((input) => {
  'use gpu';
  const uv = input.uv.mul(2).sub(1);
  const bodyPosition = bodyPositionAccess.$;
  // Ray setup
  const suv = uniformsAccess.$.invProjMat.mul(d.vec4f(uv, 0, 1)).xy;
  let ro = d.vec3f(suv, 0);
  let rd = uniformsAccess.$.invProjMat.mul(d.vec4f(0, 0, 1, 0)).xyz;

  // Transforming around the pufferfish
  ro = uniformsAccess.$.invModelMat.mul(
    d.vec4f(ro.sub(bodyPosition), 1),
  ).xyz.add(bodyPosition);
  rd = uniformsAccess.$.invModelMat.mul(d.vec4f(rd, 0)).xyz;

  // Ray march
  rayMarch(ro, rd);

  const debugPos = d.vec3f(1, 0.6, 0.4);
  const debugNeg = d.vec3f(0.4, 0.6, 1);
  return d.vec4f(
    std.select(debugPos, debugNeg, lastPufferfishDist.$ <= SURF_DIST).mul(
      std.sin(minPufferfishDist.$ * 50) * 0.25 + 0.75,
    ),
    1,
  );
});
