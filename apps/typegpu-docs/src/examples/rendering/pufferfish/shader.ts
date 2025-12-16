import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import {
  abs,
  clamp,
  cos,
  cross,
  dot,
  length,
  max,
  min,
  mix,
  normalize,
  radians,
  sign,
  sin,
  smoothstep,
  sqrt,
} from 'typegpu/std';
import * as sdf from '@typegpu/sdf';

/**
 * Holds custom parameters that can be sent to the shader via Smelter
 */
export const Uniforms = d.struct({
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

  // Memory padding.
  a: d.f32,
});

export const timeAccess = tgpu['~unstable'].accessor(d.f32);
export const uniformsAccess = tgpu['~unstable'].accessor(Uniforms);

const MAX_STEPS = 1000;
const MAX_DIST = 30.0;
const SURF_DIST = 0.001;
const SPIKES_NUM = 60;
const SMOOTHNESS_FACTOR = 0.2;

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

const rotationMatrixY = (angle: number): d.m3x3f => {
  'use gpu';
  const c = cos(angle);
  const s = sin(angle);

  return d.mat3x3f(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
};

const rotationMatrixX = (angle: number): d.m3x3f => {
  'use gpu';
  const c = cos(angle);
  const s = sin(angle);
  return d.mat3x3f(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
};

const rotationMatrixZ = (angle: number): d.m3x3f => {
  'use gpu';
  const c = cos(angle);
  const s = sin(angle);
  return d.mat3x3f(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0);
};

const sdEllipsoid = (p: d.v3f, r: d.v3f): number => {
  'use gpu';
  const k0 = length(p.div(r));
  const k1 = length(p.div(r.mul(r)));
  return (k0 * (k0 - 1.0)) / k1;
};

const sdCone = (p: d.v3f, c: d.v2f, h: number): number => {
  'use gpu';
  const q = d.vec2f(c.x / c.y, -1).mul(h);
  const w = d.vec2f(length(p.xz), p.y);
  const a = w.sub(q.mul(clamp(dot(w, q) / dot(q, q), 0, 1)));
  const b = w.sub(q.mul(d.vec2f(clamp(w.x / q.x, 0, 1), 1)));
  const k = sign(q.y);
  const dd = min(dot(a, a), dot(b, b));
  const s = max(k * (w.x * q.y - w.y * q.x), k * (w.y - q.y));
  return sqrt(dd) * sign(s);
};

const dot2 = (a: d.v3f): number => {
  'use gpu';
  return dot(a, a);
};

const udTriangle = (p: d.v3f, a: d.v3f, b: d.v3f, c: d.v3f): number => {
  'use gpu';
  const ba = b.sub(a);
  const pa = p.sub(a);
  const cb = c.sub(b);
  const pb = p.sub(b);
  const ac = a.sub(c);
  const pc = p.sub(c);
  const nor = cross(ba, ac);
  const condition = sign(dot(cross(ba, nor), pa)) +
      sign(dot(cross(cb, nor), pb)) +
      sign(dot(cross(ac, nor), pc)) <
    2;
  if (condition) {
    return sqrt(
      min(
        min(
          dot2(ba.mul(clamp(dot(ba, pa) / dot2(ba), 0, 1)).sub(pa)),
          dot2(cb.mul(clamp(dot(cb, pb) / dot2(cb), 0, 1)).sub(pb)),
        ),
        dot2(ac.mul(clamp(dot(ac, pc) / dot2(ac), 0, 1)).sub(pc)),
      ),
    );
  } else {
    return sqrt((dot(nor, pa) * dot(nor, pa)) / dot2(nor));
  }
};

const isPointInSphereCap = (point: d.v3f, capAngle: number): boolean => {
  'use gpu';
  const pointDir = normalize(point.sub(bodyPositionAccess.$));
  const capDir = normalize(d.vec3f(0.0, 0.0, -1.0));
  const capDot = dot(pointDir, capDir);
  return capDot > cos(capAngle);
};

// Golden angle
const phi = Math.PI * (sqrt(5.0) - 1.0);

const fibonacciSphereDistribution = (index: number): d.v3f => {
  'use gpu';
  const y = 1.0 - (d.f32(index) / d.f32(SPIKES_NUM - 1)) * 2.0;
  const radius = sqrt(1.0 - y * y);
  const theta = phi * d.f32(index);
  const x = cos(theta) * radius;
  const z = sin(theta) * radius;
  return d.vec3f(x, y, z);
};

const calcConeRotationMatrix = (p: d.v3f, radii: d.v3f): d.m3x3f => {
  'use gpu';
  // The normal of an ellipsoid at point p is normalize(p / (radii*radii))
  const newY = normalize(p.div(radii.mul(radii)));
  const worldUp = d.vec3f(0.0, 1.0, 0.0);

  let newZ = d.vec3f();
  if (abs(newY.y) > 0.999) {
    newZ = d.vec3f(1, 0, 0);
  } else {
    newZ = normalize(cross(newY, worldUp));
  }

  const newX = normalize(cross(newY, newZ));

  // prettier-ignore
  return d.mat3x3f(
    newX.x,
    newY.x,
    newZ.x,
    newX.y,
    newY.y,
    newZ.y,
    newX.z,
    newY.z,
    newZ.z,
  );
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
  const h = max(k - abs(a.dist - b.dist), 0.0) / k;
  const m = h * h;

  const dist = min(a.dist, b.dist) - m * k * 0.25;

  let weight = d.f32();
  if (a.dist > b.dist) {
    weight = 1.0 - m;
  } else {
    weight = m;
  }

  const color = mix(a.color, b.color, weight);

  return Shape({ color, dist });
};

const minPufferfishDist = tgpu.privateVar(d.f32, MAX_DIST);
const lastPufferfishDist = tgpu.privateVar(d.f32, MAX_DIST);

// Get pufferfish SDF with spikes and eyes
const getPufferfish = (p: d.v3f): Shape => {
  'use gpu';
  const time = timeAccess.$;
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
  const spikeAngle = radians(5.0);
  const spikeConeC = d.vec2f(sin(spikeAngle), cos(spikeAngle));
  const spikeHeight = uniformsAccess.$.spike_height;
  const spikeFreeAreaAngle = radians(40.0);

  for (let i = d.i32(0); i < SPIKES_NUM; i++) {
    const spikeUnitPoint = fibonacciSphereDistribution(i);
    // Scale unit sphere point to ellipsoid surface
    const spikeSurfacePoint = spikeUnitPoint.mul(bodyRadii);
    const spikeWorldPoint = bodyPosition.add(spikeSurfacePoint);

    // Skip spikes from face area
    if (isPointInSphereCap(spikeWorldPoint, spikeFreeAreaAngle)) {
      continue;
    }

    // The normal is used to orient the cone outwards
    const spikeRotation = calcConeRotationMatrix(spikeSurfacePoint, bodyRadii);

    // Position the cone slightly above the surface
    const spikeNormal = normalize(
      spikeSurfacePoint.div(bodyRadii.mul(bodyRadii)),
    );
    const spikePoint = spikeWorldPoint.add(spikeNormal.mul(spikeHeight));
    const spikeLocalP = p.sub(spikePoint);
    const spikeRotatedP = spikeRotation.mul(spikeLocalP);

    const spike = Shape({
      color: bodyColor,
      dist: sdCone(spikeRotatedP, spikeConeC, spikeHeight),
    });
    fishBody = smoothShapeUnion(fishBody, spike, SMOOTHNESS_FACTOR);
  }

  // Fins
  const finLength = 0.2;
  const finYOffset = 0.3;
  const finXOffset = 0.2;
  const finAnimationFreq = -3;
  const leftFinXOffset = sin(time * finAnimationFreq) * 0.05;
  const leftFinYOffset = cos(time * finAnimationFreq) * 0.1;
  const leftFinZTwist = sin(time * finAnimationFreq) * 0.2;
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
  const rightFinXOffset = cos(time * finAnimationFreq) * 0.05;
  const rightFinYOffset = sin(time * finAnimationFreq) * 0.1;
  const rightFinZTwist = cos(time * finAnimationFreq) * 0.2;
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
  fishBody = shapeUnion(fishBody, fins);

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

const sampleFaceTexture = tgpu.fn([d.vec2f], d.vec4f)`(uv) {
  return vec4f(0, 1, 1, 1);
}`;

const getNormal = (p: d.v3f): d.v3f => {
  'use gpu';
  const dist = getPufferfish(p).dist;
  const e = 0.01;

  const n = d.vec3f(
    getPufferfish(p.add(d.vec3f(e, 0, 0))).dist - dist,
    getPufferfish(p.add(d.vec3f(0, e, 0))).dist - dist,
    getPufferfish(p.add(d.vec3f(0, 0, e))).dist - dist,
  );

  return normalize(n);
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
  const rotationMatY = rotationMatrixY(uniformsAccess.$.head_yaw);
  const rotationMatX = rotationMatrixX(uniformsAccess.$.head_pitch);
  const rotationMatZ = rotationMatrixZ(cameraRollAccess.$);
  const rotationMat = rotationMatY.mul(rotationMatX).mul(rotationMatZ);
  const initialRo = d.vec3f(uv.x, uv.y, 0);
  const ro = rotationMat.mul(initialRo.sub(bodyPosition)).add(bodyPosition);
  const rd = rotationMat.mul(d.vec3f(0, 0, 1));

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
  const faceUv = uv.mul(faceSize).mul(0.5).add(0.5);
  if (distance < MAX_DIST) {
    // Hit the pufferfish
    // const localPos = hitPos.sub(bodyPosition);
    normal = normalize(getNormal(hitPos));
    const smoothNormal = normalize(hitPos.sub(bodyPosition));

    // Face fish mode logic
    const maskOuterThreshold = 0.3;
    const maskInnerThreshold = 0.8;
    blendFactor = smoothstep(
      maskOuterThreshold,
      maskInnerThreshold,
      -smoothNormal.z,
    );
    textureUV = mix(faceOval.xy, faceOval.zw, faceUv);
  }

  // Has to be called in uniform control flow
  const textureColor = sampleFaceTexture(textureUV);
  let result = d.vec4f();

  if (distance < MAX_DIST) {
    // Lighting
    const lightDir = normalize(d.vec3f(0.0, -1, -0.5)); // Light comes from the top
    const att = clamp(dot(normal, lightDir) * 5, 0, 1);
    const diffuseLight = d.vec3f(att * 0.6);
    const ambientLight = d.vec3f(0.4, 0.45, 0.5);
    const litFishColor = march.color.mul(diffuseLight.add(ambientLight));

    const finalColor = mix(litFishColor, textureColor.xyz, blendFactor);

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
  result = result.mul(mix(1, sin(timeAccess.$ * 10) * 0.05 + 0.4, immunity));

  return result;
});
