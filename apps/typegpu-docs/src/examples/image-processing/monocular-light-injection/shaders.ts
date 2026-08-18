import { d, std, tgpu } from 'typegpu';

export const DEPTH_WORKGROUP_SIZE = 64;
export const SURFACE_WORKGROUP_SIZE = 8;

/** The 3x3 tap ring shared by the occlusion sweep and the bulb coverage probe */
const RING_OFFSETS = [-1, 0, 1] as const;

export const RelightMode = {
  RELIT: 0,
  CAMERA: 1,
  DEPTH: 2,
  NORMALS: 3,
} as const;

const RANGE_BLEND = 0.12;
const TEMPORAL_ALPHA = 0.32;
const MOTION_ALPHA = 0.8;
const MOTION_LOW = 0.02;
const MOTION_HIGH = 0.09;

/**
 * Baseline of the depth difference, in texels. A derivative amplifies in
 * proportion to frequency, so a narrow baseline points the amplifier at the band
 * where a 448 field is least trustworthy: below the model's own effective
 * resolution, where its error on a textureless surface lives. Widening the
 * baseline divides that error by the span while leaving real form, which is
 * gentle across a face and steep across a silhouette, almost untouched. It is
 * also its own low pass, so nothing has to be blurred before it.
 */
const GRADIENT_RADIUS = 7;
const GRADIENT_BACK = -GRADIENT_RADIUS;
/**
 * The steepest per-texel slope still read as surface. Across the model's 448
 * output a face puts about this much normalized disparity between the side of
 * the nose and the cheek behind it, so facial form sits just under the ceiling
 * and keeps its full slope.
 */
const GRADIENT_LIMIT = 0.009;
/**
 * Where the model's own error ends and form begins, in slope per texel. What is
 * left of that error after the wide baseline has divided it, and no more: the
 * floor exists to catch the residue, not to separate two populations that a
 * narrow baseline leaves overlapping.
 */
const GRADIENT_NOISE = 0.0003;
const GRADIENT_NOISE_ENERGY = GRADIENT_NOISE ** 2;
const OCCLUSION_RADII = [3, 9] as const;
const OCCLUSION_TAPS = OCCLUSION_RADII.length * (RING_OFFSETS.length ** 2 - 1);
const OCCLUSION_SCALE = 0.07;
const OCCLUSION_RANGE = 0.25;
/**
 * Depth difference a tap must clear before it darkens anything. The sweep reads
 * the depth field directly, with none of the shaping the normal gets, so without
 * a floor it converts the model's error on a flat wall into soft creases that no
 * control can turn down.
 */
const OCCLUSION_FLOOR = 0.012;

const NEAR_Z = 0;
/** Depth of the furthest surface the relit scene can hold. */
export const SURFACE_FAR_Z = -0.7;
const LIGHT_RADIUS = 0.85;
/**
 * How far past the terminator the key light wraps. A face only reads as lit when
 * its shadow side reaches zero, so the wrap has to be narrow enough to leave a
 * terminator. At 0.5 the cosine never falls below a quarter of full key anywhere
 * on the subject, which lights every surface from every direction and flattens
 * the form.
 */
const LIGHT_WRAP = 0.25;
const RELIEF_SCALE = 200;
const SLOPE_COMPRESSION = 0.55;
const SPECULAR_POWER = 36;
/**
 * Reflectance of the specular lobe facing the viewer, against 1 at grazing
 * angles. Without the Fresnel weight the lobe is strongest where the normal
 * bisects view and light, which on a face is the middle of the forehead, nose and
 * cheek, and reads as grease. Raising relief tilts more of the surface into the
 * lobe, so the effect grows with a control that is meant to shape form.
 */
const SPECULAR_F0 = 0.06;
const GAMMA = 2.2;
const WHITE_POINT = 2.6;
const LUMINANCE_WEIGHTS = d.vec3f(0.2126, 0.7152, 0.0722);
const HIGHLIGHT_BLEACH = 2;
/** Cool fill under the warm key, so unlit areas read as shadow and not as a dimmed photo */
const AMBIENT_FILL = d.vec3f(0.78, 0.86, 1);
const DITHER_STEP = 1 / 255;

const BULB_WORLD_RADIUS = 0.05;
const BULB_CAMERA_Z = 2;
const BULB_REFERENCE_Z = 0.42;
const BULB_CORE = 8;
const BULB_LIMB = 0.28;
const BULB_EDGE = 0.75;
const BULB_EDGE_FLOOR = 0.004;
const BULB_EDGE_LIMIT = 0.3;
const BULB_HALO = 1.6;
const BULB_HALO_SPAN = 1.2;
const BULB_VEIL = 0.12;
const BULB_VEIL_SPAN = 4;
const BULB_ONSET = 0.6;
const BULB_OCCLUSION_SOFTNESS = 0.02;
const BULB_SOURCE_SOFTNESS = 0.08;
const BULB_SAMPLE_SPREAD = 0.6;
const BULB_SAMPLES = RING_OFFSETS.length ** 2;

const SHADOW_FAR_Z = -1.25;
const SHADOW_STEPS = 32;
const SHADOW_SPAN = 0.3;
const SHADOW_BASELINE = 0.005;
const SHADOW_BIAS = 0.014;
const SHADOW_SLOPE_BIAS = 0.02;
const SHADOW_THICKNESS = 0.7;
/**
 * How much the occluder thickness window widens along the ray. A fixed window
 * cannot cast a shadow onto a background much further away than the subject: the
 * shadow-space span is 1.25, so a near face over a far wall sits about 1.2 in
 * front of it and falls outside a 0.7 window, which drops the shadow entirely
 * and leaves only a rim hugging the silhouette. An occluder found after the ray
 * has travelled is legitimately allowed to be thicker than one found immediately,
 * so the window grows with travel instead of admitting everything at once.
 */
const SHADOW_THICKNESS_GROWTH = 2.6;
const SHADOW_SOFTNESS = 0.089;
const SHADOW_GAIN = 2.5;

export const DepthParams = d.struct({
  outputSize: d.vec2u,
  reset: d.u32,
});

export const RelightParams = d.struct({
  uvTransform: d.mat2x2f,
  lightColor: d.vec4f,
  lightPosition: d.vec2f,
  lightZ: d.f32,
  exposure: d.f32,
  intensity: d.f32,
  relief: d.f32,
  specular: d.f32,
  shadow: d.f32,
  occlusion: d.f32,
  swapAxes: d.u32,
  mirror: d.u32,
  mode: d.u32,
});

export const rangeStabilityLayout = tgpu.bindGroupLayout({
  params: { uniform: DepthParams },
  frameRange: { storage: d.vec2f, access: 'readonly' },
  stableRange: { storage: d.vec2f, access: 'mutable' },
});

export const depthPrepareLayout = tgpu.bindGroupLayout({
  params: { uniform: DepthParams },
  disparity: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  stableRange: { storage: d.vec2f, access: 'readonly' },
  history: { storage: d.arrayOf(d.f32), access: 'mutable' },
});

export const surfaceLayout = tgpu.bindGroupLayout({
  params: { uniform: DepthParams },
  depth: { storage: d.arrayOf(d.f32), access: 'readonly' },
  surface: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

export const relightLayout = tgpu.bindGroupLayout({
  params: { uniform: RelightParams },
  surface: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});

export const relightFrameLayout = tgpu.bindGroupLayout({
  frame: { externalTexture: d.textureExternal() },
});

/**
 * Tracks the percentile range with an exponential average so a per-frame
 * histogram wobble cannot pulse the whole image.
 */
export const stabilizeRangeKernel = tgpu.computeFn({ workgroupSize: [1] })(() => {
  'use gpu';
  const low = rangeStabilityLayout.$.frameRange.x;
  const high = std.max(rangeStabilityLayout.$.frameRange.y, low + 0.001);
  if (rangeStabilityLayout.$.params.reset !== 0) {
    rangeStabilityLayout.$.stableRange = d.vec2f(low, high);
    return;
  }

  const previousLow = rangeStabilityLayout.$.stableRange.x;
  const previousHigh = rangeStabilityLayout.$.stableRange.y;
  rangeStabilityLayout.$.stableRange = d.vec2f(
    std.mix(previousLow, low, RANGE_BLEND),
    std.mix(previousHigh, high, RANGE_BLEND),
  );
});

/**
 * Normalizes relative disparity against the stabilized range and blends it with
 * history at a rate that rises with the per-pixel change, so still regions
 * denoise while moving edges snap instead of trailing a ghost.
 */
export const depthPrepareKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [DEPTH_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const width = depthPrepareLayout.$.params.outputSize.x;
  const index = gid.x;
  if (index >= width * depthPrepareLayout.$.params.outputSize.y) {
    return;
  }

  const low = depthPrepareLayout.$.stableRange.x;
  const span = std.max(depthPrepareLayout.$.stableRange.y - low, 0.001);
  const disparity = depthPrepareLayout.$.disparity[index].x;
  let normalized = d.f32(0);
  if (disparity === disparity) {
    normalized = std.saturate((disparity - low) / span);
  }

  let filtered = d.f32(normalized);
  if (depthPrepareLayout.$.params.reset === 0) {
    const previous = depthPrepareLayout.$.history[index];
    const motion = std.smoothstep(MOTION_LOW, MOTION_HIGH, std.abs(normalized - previous));
    filtered = std.mix(previous, normalized, std.mix(TEMPORAL_ALPHA, MOTION_ALPHA, motion));
  }

  depthPrepareLayout.$.history[index] = filtered;
});

function texelIndex(coord: d.v2i, size: d.v2i): number {
  'use gpu';
  const clamped = std.clamp(coord, d.vec2i(0), size - 1);
  return d.u32(clamped.y) * d.u32(size.x) + d.u32(clamped.x);
}

function depthTexelAt(coord: d.v2i, size: d.v2i): number {
  'use gpu';
  return surfaceLayout.$.depth[texelIndex(coord, size)];
}

/**
 * Leans toward whichever one-sided difference is smaller, so a silhouette is
 * never straddled. The side that crosses it reads far steeper than the side that
 * does not, and the gentler of the two is the one still on the surface.
 *
 * Each side is weighted by the other's magnitude, which prefers the gentler one
 * without ever choosing it outright. Choosing outright is a hard switch, and the
 * place it switches is the crest of a ridge, where the two sides are equal and
 * opposite: a nose bridge is drawn as a seam down its own centre because the
 * gradient jumps across it. Weighted, the crest resolves to the average of the
 * two, which is flat, which is what the top of a ridge is.
 */
function gentlerDelta(backward: number, forward: number): number {
  'use gpu';
  const back = std.abs(backward);
  const front = std.abs(forward);
  return (backward * front + forward * back) / std.max(back + front, 0.000000001);
}

/**
 * Passes only as much of the depth slope as can be surface, so the relief gain
 * has nothing but form to amplify.
 *
 * Below the noise floor the field describes the model's own error rather than
 * geometry. Carried through, relief lifts a wall's error exactly as hard as it
 * lifts a cheek, and every textureless region gains soft blotches that track
 * nothing in the scene.
 *
 * The floor is subtracted in energy rather than scaled by a ramp. A ramp is a
 * multiplicative gate, and where the error band and the gentle end of real form
 * overlap it attenuates the whole neighbourhood of the cut, taking the cheek,
 * the brow and the jaw roll with it, which is most of what gives a face its
 * mass. Subtraction is monotone and preserves relative structure, so a slope
 * moderately above the floor keeps nearly all of itself and only what sits under
 * it collapses, and the result stays sensible when the floor is somewhat wrong.
 *
 * The ceiling is approached smoothly rather than clipped. A hard clamp is flat
 * on one side of a threshold and not the other, so it draws its own contour
 * wherever a surface crosses it, and facial form sits just under this ceiling by
 * construction: the nostrils and the sides of the nose step through it. Saturating
 * instead leaves gentle slopes untouched, bends only what approaches the limit,
 * and reaches the same asymptote.
 *
 * A silhouette is held at the ceiling and never relaxed below it. The ramp has
 * no surface normal to recover, but flattening it is not neutral: under a light
 * near the view axis a normal facing the camera carries the highest lambert in
 * the frame, so a relaxed ramp is drawn as a pale stroke around the subject,
 * brighter than the subject and the background at once. At the ceiling it shades
 * like the surfaces it separates, which sit near the ceiling themselves wherever
 * relief is doing any work.
 *
 * The shaping runs on the gradient magnitude rather than per axis, so a slope
 * running diagonally is treated the same as one running along a texel row.
 */
function surfaceSlope(gradient: d.v2f): d.v2f {
  'use gpu';
  const steepness = std.max(std.length(gradient), 0.000000001);
  const shrunk = std.sqrt(std.max(steepness * steepness - GRADIENT_NOISE_ENERGY, 0));
  const ceiling = GRADIENT_LIMIT * std.tanh(shrunk / GRADIENT_LIMIT);
  return gradient * (ceiling / steepness);
}

/**
 * Derives the surface slope and a height-field occlusion term from the depth
 * field, carrying the depth through so lighting and shadows keep their full
 * contrast.
 *
 * Occlusion taps carry a range check, so a subject standing well in front of the
 * background creases nothing behind it and is not traced by an outline.
 */
export const surfaceKernel = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [SURFACE_WORKGROUP_SIZE, SURFACE_WORKGROUP_SIZE],
})(({ gid }) => {
  'use gpu';
  const size = d.vec2i(surfaceLayout.$.params.outputSize);
  const coord = d.vec2i(gid.xy);
  if (coord.x >= size.x || coord.y >= size.y) {
    return;
  }

  const center = depthTexelAt(coord, size);
  const left = depthTexelAt(coord + d.vec2i(GRADIENT_BACK, 0), size);
  const right = depthTexelAt(coord + d.vec2i(GRADIENT_RADIUS, 0), size);
  const up = depthTexelAt(coord + d.vec2i(0, GRADIENT_BACK), size);
  const down = depthTexelAt(coord + d.vec2i(0, GRADIENT_RADIUS), size);
  const gradient = surfaceSlope(
    d.vec2f(gentlerDelta(center - left, right - center), gentlerDelta(center - up, down - center)) /
      d.f32(GRADIENT_RADIUS),
  );

  let occlusion = d.f32(0);
  for (const radius of tgpu.unroll(OCCLUSION_RADII)) {
    for (const stepY of tgpu.unroll(RING_OFFSETS)) {
      for (const stepX of tgpu.unroll(RING_OFFSETS)) {
        if (stepX !== 0 || stepY !== 0) {
          const neighbor = depthTexelAt(coord + d.vec2i(stepX * radius, stepY * radius), size);
          const difference = neighbor - center;
          const contact = 1 - std.saturate(std.abs(difference) / OCCLUSION_RANGE);
          const cleared = std.max(difference - OCCLUSION_FLOOR, 0);
          occlusion += std.saturate(cleared / OCCLUSION_SCALE) * contact;
        }
      }
    }
  }

  std.textureStore(
    surfaceLayout.$.surface,
    d.vec2u(gid.xy),
    d.vec4f(gradient, 1 - std.saturate(occlusion / d.f32(OCCLUSION_TAPS)), center),
  );
});

function surfaceZ(depth: number): number {
  'use gpu';
  return std.mix(d.f32(SURFACE_FAR_Z), d.f32(NEAR_Z), depth);
}

/**
 * The shadow march runs in a deeper space than the falloff. Attenuation wants a
 * compressed range, because a soft silhouette otherwise reads as a surface
 * hovering in front of the background and halos the subject. Occlusion wants the
 * opposite: at the compressed scale the ray climbs toward the light faster than
 * a raised hand stands above a face, so it clears the occluder before it reaches
 * it and nothing is shadowed.
 */
function shadowZ(depth: number): number {
  'use gpu';
  return std.mix(d.f32(SHADOW_FAR_Z), d.f32(NEAR_Z), depth);
}

function depthAt(uv: d.v2f): number {
  'use gpu';
  return std.textureSampleLevel(relightLayout.$.surface, relightLayout.$.sampler, uv, 0).w;
}

/**
 * Maps a screen UV onto the same square crop the model preprocessor consumes.
 * The preprocessor mirrors by flipping the output column, which lands on exactly
 * `1 - uv.x` here, so color and depth stay registered.
 */
function cameraUvAt(uv: d.v2f): d.v2f {
  'use gpu';
  let sourceSize = d.vec2f(std.textureDimensions(relightFrameLayout.$.frame));
  if (relightLayout.$.params.swapAxes !== 0) {
    sourceSize = d.vec2f(sourceSize.yx);
  }
  let framed = d.vec2f(uv);
  if (relightLayout.$.params.mirror !== 0) {
    framed = d.vec2f(1 - uv.x, uv.y);
  }
  const side = std.min(sourceSize.x, sourceSize.y);
  const sourcePixel = (sourceSize - side) * 0.5 + framed * side - 0.5;
  const clamped = std.clamp(sourcePixel, d.vec2f(0), sourceSize - 1);
  const sourceUv = (clamped + 0.5) / sourceSize;
  return relightLayout.$.params.uvTransform * (sourceUv - d.vec2f(0.5)) + d.vec2f(0.5);
}

/**
 * Interleaved gradient noise. It breaks the shadow march into per-pixel phases,
 * and dithers the final quantization, where a bloom that falls off over hundreds
 * of pixels otherwise steps through eight-bit output in visible rings.
 */
function dither(uv: d.v2f): number {
  'use gpu';
  const point = uv * 1024;
  return std.fract(52.9829189 * std.fract(0.06711056 * point.x + 0.00583715 * point.y));
}

/**
 * Marches the height field toward the light. The step phase is dithered per
 * pixel and the hits are averaged rather than maximized, so the march reads as
 * a penumbra instead of banding into arcs of equal distance from the light. An
 * occluder only counts inside a thickness window. That window sits between one
 * body part standing in front of another, which it admits, and the subject
 * standing in front of the room, which it rejects so a silhouette cannot streak
 * across everything behind it.
 *
 * The march is budgeted in screen space rather than by ray length. Because the
 * light sits in front of the scene, a fixed ray length spends most of itself
 * climbing toward the light and covers too little ground to reach a shadow's
 * true terminator, ending it early as a band of fixed width.
 *
 * The bias follows the receiver's own tangent plane. A silhouette reaches the
 * model as a ramp far steeper than the ray climbs, so a receiver standing on
 * that ramp otherwise passes beneath its own surface and shadows itself, tracing
 * an outline around the subject. A flat receiver measures a rise of zero and is
 * left bit-identical, so real shadows never move.
 *
 * The plane is measured behind the origin, on the side the ray has already
 * passed, which by construction cannot hold the occluder being searched for.
 * Measured ahead instead, a feature wider than the baseline reads as the
 * receiver's own surface and is cancelled: a nose stops shadowing a cheek.
 */
function shadowFactor(origin: d.v3f, lightDirection: d.v3f, reach: number, jitter: number): number {
  'use gpu';
  const stride = reach / d.f32(SHADOW_STEPS);
  const baselineTravel = reach * (SHADOW_BASELINE / SHADOW_SPAN);
  const trailProbe = origin - lightDirection * baselineTravel;
  const receiverRise = std.max(
    origin.z - shadowZ(depthAt(trailProbe.xy + d.vec2f(0.5))) - baselineTravel * lightDirection.z,
    d.f32(0),
  );
  const risePerTravel = receiverRise / baselineTravel;

  let occlusion = d.f32(0);
  for (const step of std.range(SHADOW_STEPS)) {
    const travel = (d.f32(step) + jitter) * stride;
    const probe = origin + lightDirection * travel;
    const difference = shadowZ(depthAt(probe.xy + d.vec2f(0.5))) - probe.z;
    const bias = SHADOW_BIAS + travel * (SHADOW_SLOPE_BIAS + risePerTravel);
    const thickness = SHADOW_THICKNESS * (1 + (travel / SHADOW_SPAN) * SHADOW_THICKNESS_GROWTH);
    if (difference > bias && difference < thickness) {
      occlusion += std.saturate((difference - bias) / SHADOW_SOFTNESS);
    }
  }
  return 1 - std.saturate((occlusion / d.f32(SHADOW_STEPS)) * SHADOW_GAIN);
}

function depthRamp(value: number): d.v3f {
  'use gpu';
  const cold = d.vec3f(0.03, 0.02, 0.12);
  const middle = d.vec3f(0.11, 0.45, 0.94);
  const warm = d.vec3f(0.85, 0.36, 0.96);
  const hot = d.vec3f(0.97, 0.97, 0.87);
  if (value < 0.4) {
    return std.mix(cold, middle, value / 0.4);
  }
  if (value < 0.75) {
    return std.mix(middle, warm, (value - 0.4) / 0.35);
  }
  return std.mix(warm, hot, (value - 0.75) / 0.25);
}

/** Screen radius of the bulb, shrinking as it is pushed away from the camera */
function bulbRadius(): number {
  'use gpu';
  return (
    BULB_WORLD_RADIUS *
    ((BULB_CAMERA_Z - BULB_REFERENCE_Z) / (BULB_CAMERA_Z - relightLayout.$.params.lightZ))
  );
}

/**
 * How much of the bulb's disc the scene leaves uncovered. This is one value for
 * the whole frame, and every pixel probes the same few texels, so the samples
 * stay resident in cache.
 */
function bulbExposure(radius: number): number {
  'use gpu';
  let open = d.f32(0);
  for (const stepY of tgpu.unroll(RING_OFFSETS)) {
    for (const stepX of tgpu.unroll(RING_OFFSETS)) {
      const probe =
        relightLayout.$.params.lightPosition +
        d.vec2f(stepX, stepY) * (radius * BULB_SAMPLE_SPREAD);
      open += std.smoothstep(
        d.f32(0),
        BULB_SOURCE_SOFTNESS,
        relightLayout.$.params.lightZ - surfaceZ(depthAt(probe)),
      );
    }
  }
  return open / d.f32(BULB_SAMPLES);
}

/**
 * Emissive sphere at the light itself, returned as radiance over coverage so the
 * caller composites it rather than adding it. Added, the disc is a film the
 * scene shows through wherever the sum stays under the tone mapper's shoulder,
 * which is most of it once the sphere is shaded. Separating the two lets the
 * sphere darken toward its limb while staying just as opaque there, which is
 * what makes it read as a ball rather than as a bright circle.
 *
 * Coverage carries the silhouette and the depth test. The front hemisphere
 * supplies the height that scene depth is tested against, so an object nearer
 * than the light eats into the sphere along a curve rather than a straight edge.
 * The silhouette softens across about a pixel, taken from the screen derivative
 * of the distance before that distance is clamped: clamped first, the derivative
 * collapses to zero at exactly the silhouette it is there to resolve. The width
 * is floored, because a smoothstep whose edges meet is undefined.
 *
 * Radiance does not fall with distance, so the sphere only shrinks as it is
 * pushed back. Brightening it toward the camera would read as a dimmer switch
 * rather than as movement. It whitens toward the middle, where a source this
 * bright carries no hue, and keeps the tint at the limb.
 */
function bulbSurface(uv: d.v2f, tint: d.v3f, depth: number): d.v4f {
  'use gpu';
  const radius = bulbRadius();
  const spread = std.length(uv - relightLayout.$.params.lightPosition) / radius;
  const limb = std.saturate(spread);
  const dome = std.sqrt(std.max(1 - limb * limb, d.f32(0)));
  const facing = dome * dome;
  const front = relightLayout.$.params.lightZ + BULB_WORLD_RADIUS * dome;
  const solid = std.smoothstep(d.f32(0), BULB_OCCLUSION_SOFTNESS, front - surfaceZ(depth));
  const edge = std.clamp(std.fwidth(spread) * BULB_EDGE, BULB_EDGE_FLOOR, BULB_EDGE_LIMIT);
  const coverage = (1 - std.smoothstep(1 - edge, 1 + edge, spread)) * solid;
  const hue = std.mix(tint, d.vec3f(1), facing * facing);
  return d.vec4f(hue * (BULB_CORE * std.mix(d.f32(BULB_LIMB), d.f32(1), facing)), coverage);
}

/**
 * Bloom around the source, in two lobes measured in bulb radii so both track the
 * sphere as it grows and shrinks. The tight lobe hugs the silhouette and is what
 * sells the sphere as emissive; the wide one is faint enough to read as
 * atmosphere instead of as a veil over the relit subject.
 *
 * A bloom is formed at the camera rather than on the surface it falls across, so
 * testing it per pixel would cut the occluder's silhouette out of it. It fades
 * with how much of the source is covered instead.
 */
function bulbGlow(uv: d.v2f, tint: d.v3f): d.v3f {
  'use gpu';
  const radius = bulbRadius();
  const radii = std.length(uv - relightLayout.$.params.lightPosition) / radius;
  const halo = std.exp(0 - radii / BULB_HALO_SPAN);
  const veil = std.exp(0 - radii / BULB_VEIL_SPAN);
  return tint * ((halo * BULB_HALO + veil * BULB_VEIL) * bulbExposure(radius));
}

/**
 * How present the bulb is. It fades in with the light and then holds, so raising
 * the intensity brightens the subject instead of the bloom that would hide it.
 */
function bulbPresence(): number {
  'use gpu';
  return std.saturate(relightLayout.$.params.intensity / BULB_ONSET);
}

function compress(value: number): number {
  'use gpu';
  return (value * (value / (WHITE_POINT * WHITE_POINT) + 1)) / (value + 1);
}

/**
 * Compresses luminance and carries the color through untouched, then bleaches
 * toward the per-channel curve as the result approaches white. Run per channel
 * alone, a tinted light clips one channel at a time and walks the hue up the
 * ramp, so skin lit warm turns orange, then yellow, then chalk, and the light
 * loses its color exactly where it is doing the most work. Neutral colors are
 * left bit-identical, since both curves agree when the channels do.
 */
function tonemap(color: d.v3f): d.v3f {
  'use gpu';
  const luminance = std.max(std.dot(color, LUMINANCE_WEIGHTS), d.f32(0.0001));
  const mapped = compress(luminance);
  const shoulder = color / d.vec3f(WHITE_POINT * WHITE_POINT) + d.vec3f(1);
  const perChannel = (color * shoulder) / (color + d.vec3f(1));
  const bleach = std.pow(std.saturate(mapped), d.f32(HIGHLIGHT_BLEACH));
  return std.saturate(std.mix(color * (mapped / luminance), perChannel, bleach));
}

export const relightFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const cameraColor = std.saturate(
    std.textureSampleBaseClampToEdge(
      relightFrameLayout.$.frame,
      relightLayout.$.sampler,
      cameraUvAt(uv),
    ).rgb,
  );
  if (relightLayout.$.params.mode === RelightMode.CAMERA) {
    return d.vec4f(cameraColor, 1);
  }

  const surface = std.textureSampleLevel(relightLayout.$.surface, relightLayout.$.sampler, uv, 0);
  if (relightLayout.$.params.mode === RelightMode.DEPTH) {
    return d.vec4f(depthRamp(std.saturate(surface.w)), 1);
  }

  const slope = surface.xy * (relightLayout.$.params.relief * RELIEF_SCALE);
  const tilt = d.vec2f(0) - slope / (1 + std.length(slope) * SLOPE_COMPRESSION);
  const normal = std.normalize(d.vec3f(tilt, 1));
  if (relightLayout.$.params.mode === RelightMode.NORMALS) {
    return d.vec4f(normal * 0.5 + 0.5, 1);
  }

  const centered = uv - d.vec2f(0.5);
  const noise = dither(uv);
  const position = d.vec3f(centered, surfaceZ(surface.w));
  const lightPosition = d.vec3f(
    relightLayout.$.params.lightPosition - d.vec2f(0.5),
    relightLayout.$.params.lightZ,
  );
  const toLight = lightPosition - position;
  const distance = std.max(std.length(toLight), 0.0001);
  const lightDirection = toLight / distance;
  const spread = distance / LIGHT_RADIUS;
  const falloff = 1 / (1 + spread * spread);
  const wrapped = std.saturate((std.dot(normal, lightDirection) + LIGHT_WRAP) / (1 + LIGHT_WRAP));
  const lambert = wrapped * wrapped;

  let shadow = d.f32(1);
  if (relightLayout.$.params.shadow > 0) {
    const shadowOrigin = d.vec3f(centered, shadowZ(surface.w));
    const shadowToLight = lightPosition - shadowOrigin;
    const shadowDistance = std.max(std.length(shadowToLight), 0.0001);
    const reach =
      shadowDistance * (SHADOW_SPAN / std.max(std.length(shadowToLight.xy), d.f32(SHADOW_SPAN)));
    const traced = shadowFactor(shadowOrigin, shadowToLight / shadowDistance, reach, noise);
    shadow = std.mix(d.f32(1), traced, relightLayout.$.params.shadow);
  }
  const occlusion = std.mix(d.f32(1), surface.z, relightLayout.$.params.occlusion);

  const albedo = std.pow(cameraColor, d.vec3f(GAMMA));
  const tint = d.vec3f(relightLayout.$.params.lightColor.rgb);
  const halfDirection = std.normalize(lightDirection + d.vec3f(0, 0, 1));
  const lobe = std.pow(std.saturate(std.dot(normal, halfDirection)), d.f32(SPECULAR_POWER));
  const grazing = std.pow(1 - std.saturate(normal.z), d.f32(5));
  const highlight = lobe * (SPECULAR_F0 + (1 - SPECULAR_F0) * grazing);

  let lit = albedo * AMBIENT_FILL * (relightLayout.$.params.exposure * occlusion);
  lit += albedo * tint * (lambert * falloff * shadow * relightLayout.$.params.intensity);
  lit +=
    tint *
    (highlight *
      falloff *
      shadow *
      occlusion *
      relightLayout.$.params.specular *
      relightLayout.$.params.intensity);
  const presence = bulbPresence();
  const bulb = bulbSurface(uv, tint, surface.w);
  lit = std.mix(lit, bulb.xyz * presence, bulb.w * presence);
  lit += bulbGlow(uv, tint) * presence;
  const display = std.pow(tonemap(lit), d.vec3f(1 / GAMMA));
  return d.vec4f(display + (noise - 0.5) * DITHER_STEP, 1);
});
