import {
  d,
  std,
  tgpu,
  type SampledFlag,
  type TgpuBuffer,
  type TgpuRoot,
  type TgpuTexture,
  type VertexFlag,
} from 'typegpu';
import { mat4, type Mat4 } from 'math';
import { TREE_BOUNDS, TREE_FOLIAGE, TreeVertex } from './geometry.ts';

// Octahedral impostors, adapted from the "Octahedral Impostors" example: the tree is captured
// from a grid of directions spread over a sphere, and far away trees are drawn as a single
// camera-facing quad that blends between the three closest captured views.

export const VIEWS_PER_AXIS = 12;
export const FRAME_RESOLUTION = 128;
const MODEL_RADIUS = TREE_BOUNDS.radius;
export const CAPTURE_RADIUS = MODEL_RADIUS * 1.15;
export const CAPTURE_DISTANCE = CAPTURE_RADIUS * 2;

export const impostorLayout = tgpu.bindGroupLayout({
  colorAtlas: { texture: d.texture2dArray() },
  depthAtlas: { texture: d.texture2dArray(), sampleType: 'unfilterable-float' },
  atlasSampler: { sampler: 'filtering' },
});

// #region Octahedral mapping

// Directions mapped onto the UV square. The diamond in the middle is the upper hemisphere,
// the lower hemisphere folds into the four corner triangles.
export const octEncode = (direction: d.v3f) => {
  'use gpu';
  const n = direction / (std.abs(direction.x) + std.abs(direction.y) + std.abs(direction.z));
  const sign = std.select(d.vec2f(-1), d.vec2f(1), std.ge(n.xz, d.vec2f(0)));
  const folded = (1 - std.abs(n.zx)) * sign;
  return std.select(n.xz, folded, n.y < 0) * 0.5 + 0.5;
};

export const octDecode = (uv: d.v2f) => {
  'use gpu';
  const f = uv * 2 - 1;
  const y = 1 - std.abs(f.x) - std.abs(f.y);
  const xz = f - std.sign(f) * std.max(-y, 0);
  return std.normalize(d.vec3f(xz.x, y, xz.y));
};

const FrameBasis = d.struct({ right: d.vec3f, up: d.vec3f });

export const frameBasis = (direction: d.v3f) => {
  'use gpu';
  const pole = std.select(d.vec3f(0, 1, 0), d.vec3f(0, 0, 1), std.abs(direction.y) > 0.99);
  const right = std.normalize(std.cross(pole, direction));
  return FrameBasis({ right, up: std.cross(direction, right) });
};

export const frameLayer = (coordinates: d.v2f) => {
  'use gpu';
  return d.u32(coordinates.y * VIEWS_PER_AXIS + coordinates.x);
};

const ViewSelection = d.struct({ frames: d.arrayOf(d.vec2f, 3), weights: d.vec3f });

/** The three captured views surrounding `direction`, with barycentric blend weights. */
export const blendedViews = (direction: d.v3f) => {
  'use gpu';
  const grid = octEncode(direction) * (VIEWS_PER_AXIS - 1);
  const cell = std.min(std.floor(grid), d.vec2f(VIEWS_PER_AXIS - 2));
  const fraction = grid - cell;
  const lowerTriangle = fraction.x + fraction.y < 1;
  const corner = std.select(d.vec2f(1), d.vec2f(0), lowerTriangle);
  const weights = std.select(
    d.vec3f(fraction.x + fraction.y - 1, 1 - fraction.y, 1 - fraction.x),
    d.vec3f(1 - fraction.x - fraction.y, fraction.x, fraction.y),
    lowerTriangle,
  );
  return ViewSelection({
    frames: d.arrayOf(d.vec2f, 3)([cell + corner, cell + d.vec2f(1, 0), cell + d.vec2f(0, 1)]),
    weights,
  });
};

/** Expresses a capture-space point in the 2D frame of one captured view (z = depth). */
export const toFrameSpace = (position: d.v3f, coordinates: d.v2f) => {
  'use gpu';
  const direction = octDecode(coordinates / (VIEWS_PER_AXIS - 1));
  const basis = frameBasis(direction);
  return d.vec3f(
    std.dot(position, basis.right) / (2 * CAPTURE_RADIUS),
    -std.dot(position, basis.up) / (2 * CAPTURE_RADIUS),
    std.dot(position, direction),
  );
};

// #endregion

// #region Sampling

const FrameSample = d.struct({
  surface: d.vec4f, // oct-encoded normal, tone, coverage
  height: d.f32, // how far in front of the capture plane the surface is
});

/** Samples one view with parallax: shift the lookup by the height stored in the depth atlas. */
export const sampleView = (position: d.v3f, camera: d.v3f, layer: number) => {
  'use gpu';
  const ray = camera - position;
  const uvSlope = ray.xy / std.max(ray.z, 0.05);
  const uv = position.xy + 0.5 - uvSlope * position.z;
  const dx = std.dpdx(uv);
  const dy = std.dpdy(uv);
  const result = FrameSample({ surface: d.vec4f(), height: 0 });
  if (uv.x >= 0 && uv.y >= 0 && uv.x < 1 && uv.y < 1) {
    const texel = d.vec2i(uv * FRAME_RESOLUTION);
    const depth = std.textureLoad(impostorLayout.$.depthAtlas, texel, layer, 0).r;
    const height = std.select(0, CAPTURE_DISTANCE - depth, depth > 0);
    result.surface = std.textureSampleGrad(
      impostorLayout.$.colorAtlas,
      impostorLayout.$.atlasSampler,
      uv + uvSlope * height,
      layer,
      dx,
      dy,
    );
    result.height = height;
  }
  return result;
};

// #endregion

// #region Capture

const padding = Math.round(
  ((CAPTURE_RADIUS - MODEL_RADIUS) / (2 * CAPTURE_RADIUS)) * FRAME_RESOLUTION,
);

const padLayout = tgpu.bindGroupLayout({
  source: { texture: d.texture2dArray(), sampleType: 'unfilterable-float' },
  target: { storageTexture: d.textureStorage2dArray('r32float', 'write-only') },
});

/**
 * Grows the captured depth outwards by one texel, so parallax lookups that land just outside
 * the silhouette still find a sensible height.
 */
const padStep = tgpu.computeFn({
  workgroupSize: [8, 8],
  in: { id: d.builtin.globalInvocationId },
})(({ id }) => {
  'use gpu';
  const pixel = d.vec2i(id.xy);
  let result = std.textureLoad(padLayout.$.source, pixel, id.z, 0).r;
  if (result === 0) {
    let closest = d.i32(3);
    for (const y of std.range(-1, 2)) {
      for (const x of std.range(-1, 2)) {
        const distance = x * x + y * y;
        const neighbor = std.clamp(
          pixel + d.vec2i(x, y),
          d.vec2i(0),
          d.vec2i(FRAME_RESOLUTION - 1),
        );
        const candidate = std.textureLoad(padLayout.$.source, neighbor, id.z, 0).r;
        if (candidate > 0 && distance < closest) {
          result = candidate;
          closest = distance;
        }
      }
    }
  }
  std.textureStore(padLayout.$.target, pixel, id.z, d.vec4f(result, 0, 0, 0));
});

function padDepth(root: TgpuRoot, depth: TgpuTexture & SampledFlag) {
  const size = [FRAME_RESOLUTION, FRAME_RESOLUTION, VIEWS_PER_AXIS ** 2] as const;
  const targets = [0, 1].map(() =>
    root.createTexture({ size, format: 'r32float' }).$usage('storage', 'sampled'),
  );
  const pipeline = root.createComputePipeline({ compute: padStep });
  const encoder = root['~unstable'].createCommandEncoder();
  for (let step = 0; step < padding; step++) {
    const source = step === 0 ? depth : targets[(step + 1) % 2];
    const bindGroup = root.createBindGroup(padLayout, {
      source: source.createView(d.texture2dArray(), { sampleType: 'unfilterable-float' }),
      target: targets[step % 2].createView(d.textureStorage2dArray('r32float', 'write-only')),
    });
    pipeline
      .with(encoder)
      .with(bindGroup)
      .dispatchWorkgroups(FRAME_RESOLUTION / 8, FRAME_RESOLUTION / 8, VIEWS_PER_AXIS ** 2);
  }
  encoder.submit();
  targets[padding % 2].destroy();
  return targets[(padding - 1) % 2];
}

export const treeLayout = tgpu.vertexLayout(d.arrayOf(TreeVertex));

/** Renders the tree from every direction of the octahedral grid into an atlas. */
export function captureAtlas(
  root: TgpuRoot,
  treeBuffer: TgpuBuffer<d.WgslArray<typeof TreeVertex>> & VertexFlag,
  vertexCount: number,
) {
  const frameCount = VIEWS_PER_AXIS ** 2;
  const size = [FRAME_RESOLUTION, FRAME_RESOLUTION, frameCount] as const;
  const color = root
    .createTexture({ size, format: 'rgba8unorm', mipLevelCount: Math.log2(FRAME_RESOLUTION) + 1 })
    .$usage('render', 'sampled');
  const depth = root.createTexture({ size, format: 'r32float' }).$usage('render', 'sampled');
  const depthBuffer = root
    .createTexture({ size: [FRAME_RESOLUTION, FRAME_RESOLUTION], format: 'depth24plus' })
    .$usage('render');

  const captureMatrix = root.createUniform(d.mat4x4f);
  const center = d.vec3f(...TREE_BOUNDS.center);
  const renderCapture = root
    .createRenderPipeline({
      attribs: treeLayout.attrib,
      targets: { color: { format: 'rgba8unorm' }, depth: { format: 'r32float' } },
      primitive: { cullMode: 'back' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      vertex: ({ position, normal, material }) => {
        'use gpu';
        return {
          $position: captureMatrix.$ * d.vec4f(position - center, 1),
          normal,
          tone: std.select(d.f32(0), d.f32(1), material === TREE_FOLIAGE),
        };
      },
      fragment: ({ normal, tone, $position }) => {
        'use gpu';
        return {
          color: d.vec4f(octEncode(std.normalize(normal)), tone, 1),
          depth: d.vec4f(2 * CAPTURE_DISTANCE * $position.z, 0, 0, 0),
        };
      },
    })
    .with(treeLayout, treeBuffer)
    .withDepthStencilAttachment({ view: depthBuffer });

  const projection = mat4.orthoZO(
    mat4.create(),
    -CAPTURE_RADIUS,
    CAPTURE_RADIUS,
    -CAPTURE_RADIUS,
    CAPTURE_RADIUS,
    0,
    2 * CAPTURE_DISTANCE,
  );
  const view: Mat4 = mat4.create();
  const viewProj: Mat4 = mat4.create();

  for (let layer = 0; layer < frameCount; layer++) {
    const coordinates = d.vec2f(layer % VIEWS_PER_AXIS, Math.floor(layer / VIEWS_PER_AXIS));
    const direction = octDecode(coordinates.div(VIEWS_PER_AXIS - 1));
    const { up } = frameBasis(direction);
    const eye = direction.mul(CAPTURE_DISTANCE);
    mat4.lookAt(view, [eye.x, eye.y, eye.z], [0, 0, 0], [up.x, up.y, up.z]);
    captureMatrix.write(mat4.multiply(viewProj, projection, view));

    const frameView = { baseArrayLayer: layer, arrayLayerCount: 1, mipLevelCount: 1 };
    renderCapture
      .withColorAttachment({
        color: { view: color.createView('render', frameView), clearValue: [0, 0, 0, 0] },
        depth: { view: depth.createView('render', frameView), clearValue: [0, 0, 0, 0] },
      })
      .draw(vertexCount);
  }

  color.generateMipmaps();
  const paddedDepth = padDepth(root, depth);
  depth.destroy();
  depthBuffer.destroy();

  return {
    colorAtlas: color.createView(d.texture2dArray()),
    depthAtlas: paddedDepth.createView(d.texture2dArray(), { sampleType: 'unfilterable-float' }),
  };
}

// #endregion
