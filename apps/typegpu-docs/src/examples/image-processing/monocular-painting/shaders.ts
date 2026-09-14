import { randf } from '@typegpu/noise';
import { tgpu, d, std } from 'typegpu';

export const PaintMode = { PAINTING: 0, CAMERA: 1, DEPTH: 2, NORMALS: 3, DETAIL: 4 };
export const STROKES_PER_LAYER = 32768;
export const Stroke = d.struct({
  center: d.vec2f,
  axis: d.vec2f,
  halfSize: d.vec2f,
  grain: d.f32,
  detail: d.f32,
  depth: d.f32,
  opacity: d.f32,
  color: d.vec4f,
  memory: d.vec4f,
  footprintMemory: d.arrayOf(d.vec4f, 4),
  dirty: d.u32,
  progress: d.f32,
  previousProgress: d.f32,
});
export const PaintParams = d.struct({
  uvTransform: d.mat2x2f,
  canvasSize: d.vec2f,
  spacing: d.f32,
  detail: d.f32,
  texture: d.f32,
  opacity: d.f32,
  normalInfluence: d.f32,
  swapAxes: d.u32,
  mirror: d.u32,
  mode: d.u32,
  resetPaint: d.u32,
  revealStep: d.f32,
});
export const paintLayout = tgpu.bindGroupLayout({
  params: { uniform: PaintParams },
  surface: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});
export const paintFrameLayout = tgpu.bindGroupLayout({
  frame: { externalTexture: d.textureExternal() },
});
export const strokeWriteLayout = tgpu.bindGroupLayout({
  strokes: { storage: d.arrayOf(Stroke), access: 'mutable' },
});
export const strokeReadLayout = tgpu.bindGroupLayout({
  grain: { texture: d.texture2d() },
  grainSampler: { sampler: 'filtering' },
  history: { texture: d.texture2d() },
  strokes: { storage: d.arrayOf(Stroke), access: 'readonly' },
});

function cameraUvAt(uv: d.v2f): d.v2f {
  'use gpu';
  let size = d.vec2f(std.textureDimensions(paintFrameLayout.$.frame));
  if (paintLayout.$.params.swapAxes !== 0) {
    size = d.vec2f(size.yx);
  }
  let framed = d.vec2f(uv);
  if (paintLayout.$.params.mirror !== 0) {
    framed = d.vec2f(1 - uv.x, uv.y);
  }
  const side = std.min(size.x, size.y);
  const pixel = size.sub(side).mul(0.5).add(framed.mul(side)).sub(0.5);
  const sourceUv = std.clamp(pixel, d.vec2f(0), size.sub(1)).add(0.5).div(size);
  return std.mul(paintLayout.$.params.uvTransform, sourceUv.sub(0.5)).add(0.5);
}

function colorAt(uv: d.v2f): d.v3f {
  'use gpu';
  return std.textureSampleBaseClampToEdge(
    paintFrameLayout.$.frame,
    paintLayout.$.sampler,
    cameraUvAt(uv),
  ).rgb;
}

// The source is copied into mip zero before bilinear downsampling each successive level.
export const underpaintLayout = tgpu.bindGroupLayout({
  image: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});
export const copyFrameFragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({
  uv,
}) => {
  'use gpu';
  return d.vec4f(colorAt(uv), 1);
});
export const downsampleFragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({
  uv,
}) => {
  'use gpu';
  return std.textureSampleLevel(underpaintLayout.$.image, underpaintLayout.$.sampler, uv, 0);
});

function grainAt(position: d.v2f): d.v4f {
  'use gpu';
  return std.textureSampleLevel(
    strokeReadLayout.$.grain,
    strokeReadLayout.$.grainSampler,
    position.div(128),
    0,
  );
}

/** Edge distance, irregular paint height, pigment variation, and pigment coverage. */
function brushField(local: d.v2f, halfSize: d.v2f, seed: number): d.v4f {
  'use gpu';
  const p = local.div(halfSize);
  const origin = d.vec2f(seed * 97, seed * 61);
  const pressure = grainAt(p.mul(d.vec2f(2.4, 1.6)).add(origin));
  const bend = (pressure.x - 0.5) * 0.24 * std.max(1 - p.x * p.x, d.f32(0));
  const across = p.y - bend;
  // Unequal bristle bundles, with fine grain breaking the tracks into deposits.
  // These random fields have no periodic wave or evenly spaced comb pattern.
  const bundles = grainAt(
    d.vec2f(p.x * 2.2 + pressure.y * 0.6, across * halfSize.y * 0.65).add(origin),
  );
  const tooth = grainAt(local.mul(0.85).add(origin.mul(1.7)));
  const endTexture = std.smoothstep(0.35, 0.95, std.abs(p.x));
  const texture = paintLayout.$.params.texture;
  const width = 0.84 + texture * (pressure.z - 0.5) * 0.24;
  const strandLength = 1 - texture * endTexture * (0.04 + 0.24 * bundles.x);
  const q = std.abs(d.vec2f(p.x / strandLength, across / width));
  const outline = std.pow(q.x * q.x * q.x + q.y * q.y * q.y, 1 / 3);
  const distance = (outline - 1) * halfSize.y + texture * (tooth.x - 0.5) * 0.65;
  const edge = std.smoothstep(d.f32(0), d.f32(1.8), -distance);
  const dry = std.smoothstep(0.24, 0.64, bundles.y * 0.75 + tooth.y * 0.25);
  const deposit = 1 - texture * endTexture * (1 - dry) * 0.9;
  // Low, uneven deposits instead of an extruded stamp with a uniform shiny rim.
  const height = edge * deposit * (0.16 + texture * pressure.w * 0.22);
  const pigment =
    texture *
    ((pressure.y - 0.5) * 0.12 + (tooth.z - 0.5) * 0.035 + endTexture * (bundles.z - 0.5) * 0.07);
  return d.vec4f(distance, height, pigment, deposit);
}

function layerSpacing(layer: number): number {
  'use gpu';
  return paintLayout.$.params.spacing * std.select(d.f32(2), d.f32(1), layer === 1);
}

/** Normalized disparity is 0 at the far plane and 1 at the near plane. */
export function depthBlurAmount(depth: number): number {
  'use gpu';
  // Keep the near half in focus; ramp only over the far half.
  return std.saturate(1 - 2 * depth);
}

export function depthStrokeScale(depth: number): number {
  'use gpu';
  // UI depth runs near-to-far; the model's disparity runs in the opposite direction.
  const near = std.saturate(2 * depth - 1);
  const far = depthBlurAmount(depth);
  const remaining = 1 - far;
  // Grow gently toward the camera, and quickly toward the larger background marks.
  return 1 + 1.4 * near * near + 2.4 * (1 - remaining * remaining * remaining);
}

export function strokeComesBefore(depth: number, index: number, otherDepth: number, otherIndex: number): boolean {
  'use gpu';
  return depth > otherDepth || (depth === otherDepth && index > otherIndex);
}

/** Luma dominates motion; each chroma axis has one quarter of its weight. */
export function cameraChange(current: d.v3f, previous: d.v3f): number {
  'use gpu';
  const delta = current.sub(previous);
  const luma = std.dot(delta, d.vec3f(0.2126, 0.7152, 0.0722));
  const cb = (delta.z - luma) / 1.8556;
  const cr = (delta.x - luma) / 1.5748;
  // Keep neutral brightness changes on the existing threshold/opacity scale.
  return std.length(d.vec3f(luma, cb * 0.25, cr * 0.25)) * 1.7320508;
}

/** Preserve gentle repainting near the motion threshold; cover large changes fully. */
export function changeOpacity(change: number, baseOpacity: number): number {
  'use gpu';
  if (baseOpacity <= 0) {
    return 0;
  }
  return std.mix(baseOpacity, d.f32(1), std.smoothstep(0.035, 0.2, change));
}

/** Compute expensive image/normal queries once per stroke, rather than once per pixel. */
export const prepareStrokes = tgpu.computeFn({
  workgroupSize: [8, 8, 1],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const spacing = layerSpacing(gid.z);
  const grid = d.vec2u(std.ceil(paintLayout.$.params.canvasSize.div(spacing)));
  if (gid.x >= grid.x || gid.y >= grid.y) {
    return;
  }
  // Seed only by the cell and layer: no frame time and no pixel-dependent jitter.
  randf.seed3(d.vec3f(d.vec2f(gid.xy).mul(0.013), d.f32(gid.z) + 0.37));
  const jitter = d.vec2f(randf.sample(), randf.sample()).sub(0.5).mul(0.8);
  const center = d.vec2f(gid.xy).add(0.5).add(jitter).mul(spacing);
  const uv = center.div(paintLayout.$.params.canvasSize);
  const index = gid.z * STROKES_PER_LAYER + gid.y * grid.x + gid.x;
  // Mip 4 retains local motion that vanished in the old 16x16 average.
  const memory = std.textureSampleLevel(
    underpaintLayout.$.image,
    underpaintLayout.$.sampler,
    uv,
    4,
  );
  // Finish a mark before sampling a new one, so continuous movement cannot
  // repeatedly restart the fade or change its color/orientation halfway through.
  if (paintLayout.$.params.resetPaint === 0 && strokeWriteLayout.$.strokes[index].progress < 1) {
    const previous = strokeWriteLayout.$.strokes[index].progress;
    strokeWriteLayout.$.strokes[index].previousProgress = previous;
    strokeWriteLayout.$.strokes[index].progress = std.min(
      previous + paintLayout.$.params.revealStep,
      d.f32(1),
    );
    strokeWriteLayout.$.strokes[index].dirty = 1;
    return;
  }
  const footprintMemory = d.arrayOf(d.vec4f, 4)();
  let change = cameraChange(memory.rgb, strokeWriteLayout.$.strokes[index].memory.rgb);
  for (const probe of std.range(4)) {
    let offset = d.vec2f(0.7, 0);
    if (probe === 1) { offset = d.vec2f(-0.7, 0); }
    if (probe === 2) { offset = d.vec2f(0, 0.7); }
    if (probe === 3) { offset = d.vec2f(0, -0.7); }
    const sample = std.textureSampleLevel(underpaintLayout.$.image, underpaintLayout.$.sampler,
      uv.add(offset.mul(spacing).div(paintLayout.$.params.canvasSize)), 4);
    footprintMemory[probe] = d.vec4f(sample);
    change = std.max(change, cameraChange(sample.rgb, strokeWriteLayout.$.strokes[index].footprintMemory[probe].rgb));
  }
  const surface = std.textureSampleLevel(paintLayout.$.surface, paintLayout.$.sampler, uv, 0);
  // A surface leaving the foreground must release its old depth occlusion too.
  change = std.max(change, std.abs(surface.w - strokeWriteLayout.$.strokes[index].depth) * 0.5);
  if (paintLayout.$.params.resetPaint === 0 && change < 0.035) {
    strokeWriteLayout.$.strokes[index].dirty = 0;
    return;
  }
  const color = colorAt(uv);
  const offset = d.vec2f(spacing * 0.35).div(paintLayout.$.params.canvasSize);
  const left = colorAt(uv.sub(d.vec2f(offset.x, 0)));
  const right = colorAt(uv.add(d.vec2f(offset.x, 0)));
  const up = colorAt(uv.sub(d.vec2f(0, offset.y)));
  const down = colorAt(uv.add(d.vec2f(0, offset.y)));
  // Local high-pass energy also sees chromatic detail and symmetric thin features.
  const mean = left.add(right).add(up).add(down).mul(0.25);
  const energy =
    std.length(color.sub(mean)) +
    0.5 * std.max(std.length(right.sub(left)), std.length(down.sub(up)));
  const detail = std.saturate(energy * paintLayout.$.params.detail * 4);
  const luminance = d.vec3f(0.2126, 0.7152, 0.0722);
  const gradient = d.vec2f(std.dot(right.sub(left), luminance), std.dot(down.sub(up), luminance));
  // Surface.xy stores depth slopes. The projected normal's perpendicular follows contours.
  const normal = std.normalize(d.vec3f(surface.xy.mul(-80), 1));
  let angle = d.f32(-0.65);
  if (std.length(gradient) > 0.005) {
    angle = std.atan2(gradient.x, -gradient.y);
  }
  const fallback = d.vec2f(std.cos(angle), std.sin(angle));
  let tangent = d.vec2f(fallback);
  if (std.length(normal.xy) > 0.01) {
    tangent = std.normalize(d.vec2f(-normal.y, normal.x));
    // Axes are unoriented: align their signs before interpolating to avoid cancellation.
    if (std.dot(tangent, fallback) < 0) {
      tangent = tangent.mul(-1);
    }
  }
  const axis = std.normalize(std.mix(fallback, tangent, paintLayout.$.params.normalInfluence));
  // The model returns normalized disparity: larger values are closer.
  const depth = std.saturate(surface.w);
  const distanceScale = depthStrokeScale(depth);
  const blur = depthBlurAmount(depth);
  const size = std
    .mix(d.vec2f(1.55, 0.85), d.vec2f(0.9, 0.52), detail)
    .mul(spacing * distanceScale);
  const softened = std.textureSampleLevel(
    underpaintLayout.$.image,
    underpaintLayout.$.sampler,
    uv,
    blur * 3.5,
  ).rgb;
  let opacity = paintLayout.$.params.opacity;
  if (paintLayout.$.params.resetPaint === 0) {
    opacity = changeOpacity(change, opacity);
  }
  strokeWriteLayout.$.strokes[index] = Stroke({
    center,
    axis,
    memory,
    footprintMemory,
    dirty: 1,
    previousProgress: 0,
    // Independent 5–15 ms delay from the moment this mark is needed.
    progress: std.min(paintLayout.$.params.revealStep - (0.05 + randf.sample() * 0.1), d.f32(1)),
    halfSize: size,
    grain: randf.sample(),
    detail,
    depth,
    opacity,
    color: d.vec4f(
      std.mix(std.mix(color, mean, (1 - detail) * 0.35), softened, blur * 0.7),
      1,
    ),
  });
});

/** Soft brush front traveling from local -X to +X, exactly empty/full at 0/1. */
export function revealAt(along: number, progress: number): number {
  'use gpu';
  const position = std.saturate(along * 0.5 + 0.5);
  const remaining = 1 - std.saturate(progress);
  const eased = 1 - remaining * remaining * remaining;
  return std.smoothstep(position - 0.12, position + 0.12, eased * 1.24 - 0.12);
}

/** Add just the missing coverage to a persistent surface, independent of frame count. */
export function incrementalAlpha(alpha: number, before: number, after: number): number {
  'use gpu';
  return std.saturate((alpha * (after - before)) / std.max(1 - alpha * before, 0.00001));
}

export const paintFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const camera = colorAt(uv);
  const mode = paintLayout.$.params.mode;
  if (mode === PaintMode.CAMERA) {
    return d.vec4f(camera, 1);
  }
  const surface = std.textureSampleLevel(paintLayout.$.surface, paintLayout.$.sampler, uv, 0);
  if (mode === PaintMode.DEPTH) {
    return d.vec4f(d.vec3f(surface.w), 1);
  }
  if (mode === PaintMode.NORMALS) {
    return d.vec4f(
      std
        .normalize(d.vec3f(surface.xy.mul(-80), 1))
        .mul(0.5)
        .add(0.5),
      1,
    );
  }
  const pixel = uv.mul(paintLayout.$.params.canvasSize);
  if (mode === PaintMode.DETAIL) {
    const grid = d.vec2u(
      std.ceil(paintLayout.$.params.canvasSize.div(paintLayout.$.params.spacing)),
    );
    const cell = std.min(d.vec2u(pixel.div(paintLayout.$.params.spacing)), grid.sub(1));
    const detail = strokeReadLayout.$.strokes[STROKES_PER_LAYER + cell.y * grid.x + cell.x].detail;
    return d.vec4f(d.vec3f(detail), 1);
  }
  // Only the low-frequency image reaches the gaps between strokes (about 8x8 texels).
  let painted = std.textureSampleLevel(
    strokeReadLayout.$.history,
    paintLayout.$.sampler,
    uv,
    0,
  ).rgb;
  if (paintLayout.$.params.resetPaint !== 0) {
    painted = std.textureSampleLevel(
      underpaintLayout.$.image,
      underpaintLayout.$.sampler,
      uv,
      7.3,
    ).rgb;
  }
  // Gather both grids into one depth order. Equal depths retain fine-over-coarse
  // and row-major ordering. Near-to-far compositing also shields existing near paint
  // from distant marks that start their animation on a later frame.
  const candidates = d.arrayOf(d.u32, 450)();
  let count = d.u32(0);
  let changing = false;
  for (const layer of std.range(2)) {
    const spacing = layerSpacing(layer);
    const grid = d.vec2i(std.ceil(paintLayout.$.params.canvasSize.div(spacing)));
    const cell = d.vec2i(std.floor(pixel.div(spacing)));
    // Cover 3.4x strokes, including jitter, bent edges and the small shadow.
    for (const y of std.range(-7, 8)) {
      for (const x of std.range(-7, 8)) {
        const neighbor = cell.add(d.vec2i(x, y));
        if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= grid.x || neighbor.y >= grid.y) {
          continue;
        }
        const index = d.u32(layer) * STROKES_PER_LAYER + d.u32(neighbor.y * grid.x + neighbor.x);
        const stroke = strokeReadLayout.$.strokes[index];
        // Invalidate a conservative area, including the previous, possibly larger mark.
        changing = changing || stroke.dirty !== 0;
        if (stroke.progress <= 0 || std.length(pixel.sub(stroke.center)) > spacing * 6.5) {
          continue;
        }
        // Reject outside the rotated brush bounds before sorting. The padding
        // includes the bent edge, antialiasing, grain displacement and tiny shadow.
        const delta = pixel.sub(stroke.center);
        const along = std.abs(std.dot(delta, stroke.axis));
        const across = std.abs(std.dot(delta, d.vec2f(-stroke.axis.y, stroke.axis.x)));
        if (along > stroke.halfSize.x + 2 || across > stroke.halfSize.y * 1.15 + 2) {
          continue;
        }
        candidates[count] = index;
        count++;
      }
    }
  }
  if (!changing) {
    return d.vec4f(painted, 1);
  }
  for (let position = d.u32(1); position < count; position++) {
    const index = candidates[position];
    const depth = strokeReadLayout.$.strokes[index].depth;
    let insert = position;
    while (insert > 0) {
      const otherIndex = candidates[insert - 1];
      const otherDepth = strokeReadLayout.$.strokes[otherIndex].depth;
      if (strokeComesBefore(otherDepth, otherIndex, depth, index)) {
        break;
      }
      candidates[insert] = otherIndex;
      insert--;
    }
    candidates[insert] = index;
  }
  // Rebuild only invalidated pixels from remembered current strokes. Blending new
  // paint over flattened history retained obsolete foreground paint indefinitely.
  painted = std.textureSampleLevel(underpaintLayout.$.image, underpaintLayout.$.sampler, uv, 7.3).rgb;
  let visibility = d.f32(1);
  let added = d.vec3f(0);
  for (let candidate = d.u32(0); candidate < count; candidate++) {
    const stroke = strokeReadLayout.$.strokes[candidates[candidate]];
    const delta = pixel.sub(stroke.center);
    const local = d.vec2f(
      std.dot(delta, stroke.axis),
      std.dot(delta, d.vec2f(-stroke.axis.y, stroke.axis.x)),
    );
    const field = brushField(local, stroke.halfSize, stroke.grain);
    const coverage = 1 - std.smoothstep(-0.65, 0.65, field.x);
    // A light above the canvas casts a short shadow downward onto the already
    // composited more distant paint. Applying it before this stroke prevents self-shadowing.
    const shadowDelta = d.vec2f(0, 0.7);
    const shadowLocal = local.sub(
      d.vec2f(
        std.dot(shadowDelta, stroke.axis),
        std.dot(shadowDelta, d.vec2f(-stroke.axis.y, stroke.axis.x)),
      ),
    );
    const shadowField = brushField(shadowLocal, stroke.halfSize, stroke.grain);
    const shadow =
      (1 - std.smoothstep(-0.5, 1.2, shadowField.x)) *
      (1 - coverage) *
      shadowField.w *
      0.04 *
      paintLayout.$.params.opacity;
    const shadowAfter = revealAt(shadowLocal.x / stroke.halfSize.x, stroke.progress);
    visibility *= 1 - shadow * shadowAfter;
    if (coverage <= 0) {
      continue;
    }
    // The per-stroke height field supplies its own bevel and bristle normals.
    const dx = brushField(local.add(d.vec2f(0.5, 0)), stroke.halfSize, stroke.grain).y - field.y;
    const dy = brushField(local.add(d.vec2f(0, 0.5)), stroke.halfSize, stroke.grain).y - field.y;
    const slope = stroke.axis.mul(dx).add(d.vec2f(-stroke.axis.y, stroke.axis.x).mul(dy)).mul(2);
    const normal = std.normalize(d.vec3f(slope.mul(-1), 1));
    const light = std.normalize(d.vec3f(-0.2, -0.85, 1));
    const halfLight = std.normalize(light.add(d.vec3f(0, 0, 1)));
    const diffuse = std.max(std.dot(normal, light), d.f32(0));
    const specular = std.pow(std.max(std.dot(normal, halfLight), d.f32(0)), d.f32(26));
    const pigment = stroke.color.rgb
      .mul((0.95 + 0.07 * diffuse) * (1 + field.z))
      .add(d.vec3f(1, 0.96, 0.86).mul(specular * 0.008));
    const after = revealAt(local.x / stroke.halfSize.x, stroke.progress);
    const opacity = coverage * field.w * stroke.opacity * after;
    added += pigment * opacity * visibility;
    visibility *= 1 - opacity;
    if (visibility < 0.001) {
      break;
    }
  }
  painted = painted * visibility + added;
  return d.vec4f(std.saturate(painted), 1);
});
