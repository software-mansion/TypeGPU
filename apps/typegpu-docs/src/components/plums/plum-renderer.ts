import { perlin3d } from '@typegpu/noise';
import { opSmoothUnion, sdRoundedBox3d, sdTriangle3d } from '@typegpu/sdf';
import { tgpu, d, std, type TgpuRoot } from 'typegpu';

export const MAX_PLUMS = 3;

/**
 * Everything the shader needs to draw one plum. Positions are in "plum units", where the
 * body is a cube with a half-size of 1, `scale` converts them to CSS pixels.
 */
export const PlumInstance = d.struct({
  /** Body center, in CSS pixels relative to the viewport */
  center: d.vec2f,
  /** CSS pixels per plum unit */
  scale: d.f32,
  opacity: d.f32,
  /** View space to body space */
  bodyInvRot: d.mat3x3f,
  /** Tail position relative to the body, in view space (y up) */
  tailOffset: d.vec3f,
  /** View space to tail space */
  tailInvRot: d.mat3x3f,
  /**
   * Where the irises are on the face plane (right and up, as seen from the front of the head),
   * relative to the middle of each eye. It's the same for both eyes.
   */
  iris: d.vec2f,
  /** Eyelid closure: upper left, upper right, lower left, lower right */
  lids: d.vec4f,
  bodyTop: d.vec3f,
  bodyBottom: d.vec3f,
  ringTop: d.vec3f,
  ringBottom: d.vec3f,
  tailTop: d.vec3f,
  tailBottom: d.vec3f,
});

export type PlumInstance = d.Infer<typeof PlumInstance>;

/** Draws plums into a canvas, implemented with WebGPU and with a WebGL 2 fallback */
export interface PlumRenderer {
  render(
    instances: PlumInstance[],
    viewport: [number, number],
    pixelRatio: number,
    ambient: number,
  ): void;
  destroy(): void;
}

const Globals = d.struct({
  viewport: d.vec2f,
  pixelRatio: d.f32,
  ambient: d.f32,
});

// The quad drawn for each plum, in plum units. It's offset upwards to fit the tail.
export const QUAD_CENTER = d.vec2f(0, 1);
export const QUAD_HALF_SIZE = 3.4;

const BODY_HALF_SIZE = 1;
const BODY_ROUNDING = 0.18;
/** A sphere around the body and the eyes, for skipping them when far away */
const BODY_BOUND_RADIUS = 1.8;

const EYE_HEIGHT = 0.12;
// Shrinking the vertical coordinate makes the eyes taller than they are wide
const EYE_SQUASH = 0.84;
const BALL_DEPTH = 0.48;
const BALL_RADIUS = 0.66;
const RING_RADIUS = 0.48;
const RING_THICKNESS = 0.054;
/** How far the rims around the eyes blend into the body, both in shape and color */
const RIM_BLEND = 0.12;
/** How far each eye is shifted towards the edge the two faces share */
const EYE_INSET = 0.13;
const LID_RADIUS = 0.7;
const IRIS_RADIUS = 0.34;
/** How far the irises move on the face plane per unit of `iris` offset */
const IRIS_REACH = BALL_RADIUS;

// The tail is a tall, thin tetrahedron, like the stalk in the TypeGPU logo. Seen from the front,
// its apex lies within the triangle formed by the other three corners, so its silhouette stays
// a triangle.
const TAIL_A = d.vec3f(-0.02, 1.05, -0.08);
const TAIL_B = d.vec3f(-0.506, 0.285, -0.08);
const TAIL_C = d.vec3f(0.2, -0.48, -0.08);
const TAIL_APEX = d.vec3f(-0.11, 0.28, 0.18);
const TAIL_ROUNDING = 0.08;
/** A sphere enclosing the tail, for skipping the exact distance when far away */
const TAIL_BOUND_CENTER = d.vec3f(-0.1, 0.28, 0);
const TAIL_BOUND_RADIUS = 0.95;

const MAT_BODY = 0;
const MAT_EYE = 1;
const MAT_TAIL = 2;

const MAX_STEPS = 72;
const HIT_DIST = 0.0015;
/** Width of the fuzzy fringe around the silhouette, in plum units */
const FUZZ = 0.05;

const SHADOW_OFFSET = d.vec2f(0.12, -0.42);
const SHADOW_COLOR = d.vec3f(0.12, 0.13, 0.32);
const SHADOW_STRENGTH = 0.16;

const LIGHT_DIR = std.normalize(d.vec3f(-0.45, 0.85, 0.6));

const SceneSample = d.struct({
  dist: d.f32,
  mat: d.u32,
  /** How far the rims around the eyes are from the body, for blending their colors */
  rimGap: d.f32,
});

const EyeSample = d.struct({
  ball: d.f32,
  /** The ring around the eye and the eyelids, both made of skin */
  rim: d.f32,
});

/** Eye-space coordinates are (along the face, up the face, out of the face). */
const toSquashedEye = (e: d.v3f) => {
  'use gpu';
  return d.vec3f(e.x, (e.y - EYE_HEIGHT) * EYE_SQUASH, e.z);
};

const eyeSample = (e: d.v3f, upperLid: number, lowerLid: number) => {
  'use gpu';
  const s = toSquashedEye(e);
  const ballP = s + d.vec3f(0, 0, BALL_DEPTH);
  const ball = std.length(ballP) - BALL_RADIUS;
  const ring = std.length(d.vec2f(std.length(s.xy) - RING_RADIUS, s.z)) - RING_THICKNESS;

  // Eyelids are caps of a shell around the eyeball, cut by a line that sweeps across it.
  // The lower lid's cut curves upwards for a cheeky squint.
  const shell = std.length(ballP) - LID_RADIUS;
  const lowerRest = std.mix(-0.72, -0.024, lowerLid);
  const lowerCut = lowerRest + s.x * s.x * 0.92 * lowerLid;
  // A fully closed upper lid meets the lower one
  const upperCut = std.mix(0.72, lowerRest - 0.024, upperLid);
  // Lids only exist in front of the face. Without that cut, the open lids still come close enough
  // to the top and bottom of the head for the rim color to bleed onto them.
  const lidShell = std.max(shell, -s.z - 0.05);
  const lids = std.min(std.max(lidShell, upperCut - s.y), std.max(lidShell, s.y - lowerCut));

  return EyeSample({ ball, rim: std.min(ring, lids) });
};

const sdTail = (t: d.v3f) => {
  'use gpu';
  const bound = std.length(t - TAIL_BOUND_CENTER) - TAIL_BOUND_RADIUS;
  if (bound > 0.1) {
    return bound;
  }
  // The faces are infinitely thin, rounding them gives the tetrahedron its volume
  const faces = std.min(
    std.min(sdTriangle3d(t, TAIL_A, TAIL_B, TAIL_C), sdTriangle3d(t, TAIL_A, TAIL_B, TAIL_APEX)),
    std.min(sdTriangle3d(t, TAIL_B, TAIL_C, TAIL_APEX), sdTriangle3d(t, TAIL_C, TAIL_A, TAIL_APEX)),
  );
  return faces - TAIL_ROUNDING;
};

/**
 * Coordinates of the left eye (on the +Z face) and the right eye (on the +X face). The faces
 * meet at the edge where x = z = 1, and both eyes sit closer to it.
 */
const leftEyeSpace = (q: d.v3f) => {
  'use gpu';
  return d.vec3f(q.x - EYE_INSET, q.y, q.z - BODY_HALF_SIZE);
};

const rightEyeSpace = (q: d.v3f) => {
  'use gpu';
  return d.vec3f(EYE_INSET - q.z, q.y, q.x - BODY_HALF_SIZE);
};

/**
 * The plum the current fragment belongs to, so the scene functions don't need it passed around.
 * Each renderer fills it in before calling `plumPixel`.
 */
export const current = tgpu.privateVar(PlumInstance);

const sceneSample = (p: d.v3f) => {
  'use gpu';
  const bodyBound = std.length(p) - BODY_BOUND_RADIUS;
  let skin = bodyBound;
  let ball = bodyBound;
  let rimGap = d.f32(1000);
  if (bodyBound < 0.1) {
    const q = current.$.bodyInvRot * p;
    const lids = current.$.lids;
    const body = sdRoundedBox3d(q, d.vec3f(BODY_HALF_SIZE), BODY_ROUNDING);
    const left = eyeSample(leftEyeSpace(q), lids.x, lids.z);
    const right = eyeSample(rightEyeSpace(q), lids.y, lids.w);
    const rim = std.min(left.rim, right.rim);
    ball = std.min(left.ball, right.ball);
    skin = opSmoothUnion(body, rim, RIM_BLEND);
    rimGap = rim - body;
  }

  const tailP = current.$.tailInvRot * (p - current.$.tailOffset);
  const tail = sdTail(tailP);

  let mat = d.u32(MAT_BODY);
  if (ball < skin) {
    mat = d.u32(MAT_EYE);
  }
  const plumDist = std.min(skin, ball);
  if (tail < plumDist) {
    mat = d.u32(MAT_TAIL);
  }

  return SceneSample({ dist: std.min(plumDist, tail), mat, rimGap });
};

const sceneDist = (p: d.v3f) => {
  'use gpu';
  return sceneSample(p).dist;
};

const sceneNormal = (p: d.v3f) => {
  'use gpu';
  // Tetrahedron technique, 4 samples instead of 6
  const e = 0.002;
  const k1 = d.vec3f(1, -1, -1);
  const k2 = d.vec3f(-1, -1, 1);
  const k3 = d.vec3f(-1, 1, -1);
  const k4 = d.vec3f(1, 1, 1);
  return std.normalize(
    k1 * sceneDist(p + k1 * e) +
      k2 * sceneDist(p + k2 * e) +
      k3 * sceneDist(p + k3 * e) +
      k4 * sceneDist(p + k4 * e),
  );
};

/** Soft drop shadow of the body, approximated from a few slices through it */
const dropShadow = (local: d.v2f) => {
  'use gpu';
  const sp = local - SHADOW_OFFSET;
  let dist = d.f32(1000);
  for (const z of tgpu.unroll([-0.7, 0, 0.7])) {
    const q = current.$.bodyInvRot * d.vec3f(sp, z);
    dist = std.min(dist, sdRoundedBox3d(q, d.vec3f(BODY_HALF_SIZE), BODY_ROUNDING));
  }
  // Fading out before the edge of the quad, so the shadow never gets cut off
  const edge = std.abs(local - QUAD_CENTER);
  const edgeFade =
    1 - std.smoothstep(QUAD_HALF_SIZE - 0.4, QUAD_HALF_SIZE, std.max(edge.x, edge.y));
  return SHADOW_STRENGTH * (1 - std.smoothstep(-0.3, 0.45, dist)) * edgeFade;
};

const eyeColor = (q: d.v3f) => {
  'use gpu';
  // Picking the eye on the face we're closest to, then working in its eye space
  const onLeft = q.z > q.x;
  const e = std.select(rightEyeSpace(q), leftEyeSpace(q), onLeft);
  // UVs on a plane in front of the face, facing the same way as the edge the eyes share. Each
  // eye face is turned 45 degrees away from it, so the depth of the eyeball shifts the UVs in
  // opposite directions on both eyes. Horizontal UVs are scaled back up by that 45 degree
  // foreshortening, so the irises keep their size.
  const s = toSquashedEye(e);
  const uv = d.vec2f(std.select(s.x + s.z, s.x - s.z, onLeft), s.y);
  const toIris = std.length(uv - current.$.iris * IRIS_REACH);
  const pupil = 1 - std.smoothstep(IRIS_RADIUS - 0.012, IRIS_RADIUS + 0.012, toIris);

  return std.mix(d.vec3f(0.97, 0.97, 0.99), d.vec3f(0.05, 0.05, 0.08), pupil);
};

/**
 * Coordinates that move along with the part of the plum at `p`, so its fuzzy texture stays
 * put on it, even as the tail sways relative to the body.
 */
const textureSpace = (p: d.v3f, mat: number) => {
  'use gpu';
  return std.select(
    current.$.bodyInvRot * p,
    current.$.tailInvRot * (p - current.$.tailOffset),
    mat === MAT_TAIL,
  );
};

/**
 * `rimGap` comes from the scene sample at `p`. `ambient` lifts the shadowed sides of the body and
 * tail, leaving the lit sides as they are.
 */
const shade = (p: d.v3f, mat: number, rimGap: number, ambient: number) => {
  'use gpu';
  const n = sceneNormal(p);
  const q = current.$.bodyInvRot * p;

  const ndl = std.dot(n, LIGHT_DIR);
  const wrap = std.saturate((ndl + 0.6) / 1.6);
  const sky = std.mix(d.vec3f(0.78, 0.8, 0.93), d.vec3f(1), n.y * 0.5 + 0.5);
  // Cheap ambient occlusion from a single sample along the normal
  const ao = std.saturate(sceneDist(p + n * 0.1) / 0.1) * 0.45 + 0.55;

  if (mat === MAT_EYE) {
    const halfway = std.normalize(LIGHT_DIR + d.vec3f(0, 0, 1));
    const spec = std.pow(std.saturate(std.dot(n, halfway)), 90) * 0.85;
    const rim = std.pow(1 - std.saturate(n.z), 4) * 0.15;
    return eyeColor(q) * (sky * 0.45 + wrap * 0.6) * ao + spec + rim;
  }

  let albedo = std.mix(current.$.bodyBottom, current.$.bodyTop, std.smoothstep(-1.5, 1.4, p.y));
  if (mat === MAT_TAIL) {
    const tailP = current.$.tailInvRot * (p - current.$.tailOffset);
    albedo = std.mix(current.$.tailBottom, current.$.tailTop, std.smoothstep(-0.48, 1.05, tailP.y));
  } else {
    const ringColor = std.mix(
      current.$.ringBottom,
      current.$.ringTop,
      std.smoothstep(EYE_HEIGHT - 0.66, EYE_HEIGHT + 0.66, q.y),
    );
    // 1 on the rims around the eyes (and the eyelids), fading to 0 on the rest of the body
    const rimWeight = 1 - std.smoothstep(-0.04, RIM_BLEND, rimGap);
    albedo = std.mix(albedo, ringColor, rimWeight);
  }

  // Velvet: fine grain in the color, and a soft sheen at grazing angles
  const grain = perlin3d.sample(textureSpace(p, mat) * 26) * 0.06;
  albedo = albedo * (1 + grain);
  const sheen = std.pow(1 - std.saturate(n.z), 2.5);
  const sheenColor = std.mix(albedo, d.vec3f(1), 0.55);

  // Fading out towards the light, so only the shadows get brighter
  const fill = sky * ambient * (1 - wrap);
  return albedo * (sky * 0.5 + wrap * 0.62 + fill) * ao + sheenColor * sheen * 0.38;
};

/** Where the tail's bounding sphere is, relative to the body, in view space */
const tailBoundCenter = () => {
  'use gpu';
  // The tail-to-view rotation is the transpose of `tailInvRot`
  const inv = current.$.tailInvRot;
  return (
    current.$.tailOffset +
    d.vec3f(
      std.dot(inv.columns[0], TAIL_BOUND_CENTER),
      std.dot(inv.columns[1], TAIL_BOUND_CENTER),
      std.dot(inv.columns[2], TAIL_BOUND_CENTER),
    )
  );
};

/** How far along a ray from `ro` towards -z it enters a sphere, or -1 if it misses it */
const sphereEntry = (ro: d.v3f, center: d.v3f, radius: number) => {
  'use gpu';
  const offset = ro.xy - center.xy;
  const h = radius * radius - std.dot(offset, offset);
  if (h < 0) {
    return d.f32(-1);
  }
  return std.max(ro.z - center.z - std.sqrt(h), 0);
};

/**
 * The premultiplied color of `current` plum at `local`, a point on its quad in plum units.
 * `pixelRatio` is the number of device pixels per CSS pixel, `ambient` is passed on to `shade`.
 */
export const plumPixel = (local: d.v2f, pixelRatio: number, ambient: number) => {
  'use gpu';
  // Orthographic rays, matching the isometric look of the drawings
  const ro = d.vec3f(local, 5);
  const pixel = 1.5 / (current.$.scale * pixelRatio);
  // The widest the fuzzy fringe around the silhouette gets
  const maxFuzz = FUZZ * 1.5 + pixel;

  // Marching starts where the ray enters the bounds of the body or the tail, rays that miss
  // both only get the drop shadow
  const bodyEntry = sphereEntry(ro, d.vec3f(), BODY_BOUND_RADIUS + maxFuzz);
  const tailEntry = sphereEntry(ro, tailBoundCenter(), TAIL_BOUND_RADIUS + maxFuzz);
  let t = d.f32(1000);
  if (bodyEntry >= 0) {
    t = bodyEntry;
  }
  if (tailEntry >= 0) {
    t = std.min(t, tailEntry);
  }

  let closest = SceneSample({ dist: 1000, mat: MAT_BODY, rimGap: 1000 });
  let closestT = d.f32(0);
  if (t < 1000) {
    for (let i = 0; i < MAX_STEPS; i++) {
      const sample = sceneSample(ro - d.vec3f(0, 0, t));
      if (sample.dist < closest.dist) {
        closest = SceneSample(sample);
        closestT = t;
      }
      if (sample.dist < HIT_DIST || t > 10) {
        break;
      }
      t += sample.dist * 0.85;
    }
  }

  // Rays that only graze the plum still get some coverage, which gives soft edges. The
  // fringe width varies with noise, so the silhouette looks fuzzy.
  let coverage = d.f32(0);
  let color = d.vec3f();
  if (closest.dist < maxFuzz) {
    const p = ro - d.vec3f(0, 0, closestT);
    const fringeNoise = perlin3d.sample(textureSpace(p, closest.mat) * 9) * 0.5 + 0.5;
    const fuzzWidth = FUZZ * (0.3 + fringeNoise) + pixel;
    coverage = 1 - std.smoothstep(0, fuzzWidth, closest.dist);
    if (coverage > 0.001) {
      color = shade(p, closest.mat, closest.rimGap, ambient);
    }
  }

  let shadow = d.f32(0);
  if (coverage < 0.999) {
    shadow = dropShadow(local);
  }

  // Premultiplied alpha, the plum composited over its shadow
  const outColor = color * coverage + SHADOW_COLOR * shadow * (1 - coverage);
  const outAlpha = coverage + shadow * (1 - coverage);
  return d.vec4f(outColor, outAlpha) * current.$.opacity;
};

const QuadCorner = d.struct({
  /** In plum units, relative to the body */
  local: d.vec2f,
  /** In CSS pixels, relative to the viewport */
  px: d.vec2f,
});

/** One of the six corners of the two triangles each plum is drawn on */
export const quadCorner = (center: d.v2f, scale: number, cornerIndex: number) => {
  'use gpu';
  const corners = [
    d.vec2f(-1, -1),
    d.vec2f(1, -1),
    d.vec2f(-1, 1),
    d.vec2f(-1, 1),
    d.vec2f(1, -1),
    d.vec2f(1, 1),
  ];
  const local = QUAD_CENTER + corners[cornerIndex] * QUAD_HALF_SIZE;
  // Plum units have y pointing up, CSS pixels have it pointing down
  const px = center + d.vec2f(local.x, -local.y) * scale;
  return QuadCorner({ local, px });
};

/** CSS pixels relative to the viewport, to clip space */
export const toClipSpace = (px: d.v2f, viewport: d.v2f) => {
  'use gpu';
  const ndc = d.vec2f(px.x / viewport.x, 1 - px.y / viewport.y) * 2 - d.vec2f(1, 1);
  return d.vec4f(ndc, 0, 1);
};

export function createPlumRenderer(root: TgpuRoot, context: GPUCanvasContext): PlumRenderer {
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  const plums = root.createReadonly(d.arrayOf(PlumInstance, MAX_PLUMS));
  const globals = root.createUniform(Globals);

  const vertexMain = tgpu.vertexFn({
    in: { vertexIndex: d.builtin.vertexIndex, instanceIndex: d.builtin.instanceIndex },
    out: {
      position: d.builtin.position,
      local: d.vec2f,
      plumIndex: d.interpolate('flat', d.u32),
    },
  })((input) => {
    'use gpu';
    const plum = plums.$[input.instanceIndex];
    const corner = quadCorner(plum.center, plum.scale, input.vertexIndex);
    return {
      position: toClipSpace(corner.px, globals.$.viewport),
      local: corner.local,
      plumIndex: input.instanceIndex,
    };
  });

  const fragmentMain = tgpu.fragmentFn({
    in: { local: d.vec2f, plumIndex: d.interpolate('flat', d.u32) },
    out: d.vec4f,
  })((input) => {
    'use gpu';
    current.$ = PlumInstance(plums.$[input.plumIndex]);
    return plumPixel(input.local, globals.$.pixelRatio, globals.$.ambient);
  });

  const pipeline = root.createRenderPipeline({
    vertex: vertexMain,
    fragment: fragmentMain,
    targets: {
      format: presentationFormat,
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      },
    },
  });

  return {
    render(
      instances: PlumInstance[],
      viewport: [number, number],
      pixelRatio: number,
      ambient: number,
    ) {
      globals.write({ viewport: d.vec2f(...viewport), pixelRatio, ambient });
      plums.write(instances);
      pipeline
        .withColorAttachment({
          view: context,
          loadOp: 'clear',
          clearValue: [0, 0, 0, 0],
        })
        .draw(6, instances.length);
    },
    destroy() {
      plums.buffer.destroy();
      globals.buffer.destroy();
    },
  };
}
