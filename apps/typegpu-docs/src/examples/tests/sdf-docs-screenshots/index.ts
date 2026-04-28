import * as sdf from '@typegpu/sdf';
import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const SDF_SNIPPETS = ['Rounded box', 'Smooth union', 'Ray marching', 'Jump flood'] as const;
type SdfSnippet = (typeof SDF_SNIPPETS)[number];

const floodResolution = 2048;
const snippetMode = root.createUniform(d.u32);

const smoothSceneSdf = tgpu.fn(
  [d.vec2f],
  d.f32,
)((p) => {
  'use gpu';
  const disk = sdf.sdDisk(p - d.vec2f(-0.18, 0), 0.22);
  const box = sdf.sdRoundedBox2d(p - d.vec2f(0.18, 0), d.vec2f(0.18), 0.05);

  return sdf.opSmoothUnion(disk, box, 0.12);
});

const sceneSdf3d = tgpu.fn(
  [d.vec3f],
  d.f32,
)((p) => {
  'use gpu';
  const sphere = sdf.sdSphere(p - d.vec3f(-0.2, 0, 0), 0.32);
  const box = sdf.sdRoundedBox3d(p - d.vec3f(0.22, 0, 0), d.vec3f(0.22), 0.04);

  return sdf.opSmoothUnion(sphere, box, 0.08);
});

const normalAt = tgpu.fn(
  [d.vec3f],
  d.vec3f,
)((p) => {
  'use gpu';
  const e = 0.002;
  return std.normalize(
    d.vec3f(
      sceneSdf3d(p + d.vec3f(e, 0, 0)) - sceneSdf3d(p - d.vec3f(e, 0, 0)),
      sceneSdf3d(p + d.vec3f(0, e, 0)) - sceneSdf3d(p - d.vec3f(0, e, 0)),
      sceneSdf3d(p + d.vec3f(0, 0, e)) - sceneSdf3d(p - d.vec3f(0, 0, e)),
    ),
  );
});

const march = tgpu.fn(
  [d.vec3f, d.vec3f],
  d.vec2f,
)((ro, rd) => {
  'use gpu';
  let t = d.f32(0);
  let hit = d.f32(0);

  for (let i = 0; i < 96; i++) {
    const p = ro + rd * t;
    const dist = sceneSdf3d(p);

    if (dist < 0.002) {
      hit = 1;
      break;
    }

    t += dist;

    if (t > 6) {
      break;
    }
  }

  return d.vec2f(t, hit);
});

const triangleEdge = (p: d.v2f, a: d.v2f, b: d.v2f) => {
  'use gpu';
  const ab = b - a;
  const ap = p - a;
  return ab.x * ap.y - ab.y * ap.x;
};

const sourceTexture = root
  .createTexture({
    size: [floodResolution, floodResolution],
    format: 'rgba8unorm',
  })
  .$usage('storage', 'sampled');

const sourceWriteView = sourceTexture.createView(d.textureStorage2d('rgba8unorm'));
const sourceSampledView = sourceTexture.createView();

const sourceLayout = tgpu.bindGroupLayout({
  source: { texture: d.texture2d() },
});

const sourceBindGroup = root.createBindGroup(sourceLayout, {
  source: sourceSampledView,
});

const bakeTriangleSource = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  const size = std.textureDimensions(sourceWriteView.$);
  const uv = (d.vec2f(x, y) + 0.5) / d.vec2f(size);

  const a = d.vec2f(0.33, 0.2);
  const b = d.vec2f(0.77, 0.52);
  const c = d.vec2f(0.35, 0.84);

  const e0 = triangleEdge(uv, a, b);
  const e1 = triangleEdge(uv, b, c);
  const e2 = triangleEdge(uv, c, a);

  let color = d.vec4f();
  if (e0 >= 0 && e1 >= 0 && e2 >= 0) {
    color = d.vec4f(std.mix(d.vec3f(1, 0.55, 0.28), d.vec3f(0.24, 0.47, 1), uv.x), 1);
  }

  std.textureStore(sourceWriteView.$, d.vec2u(x, y), color);
});

bakeTriangleSource.dispatchThreads(floodResolution, floodResolution);

const floodRunner = sdf
  .createJumpFlood({
    root,
    size: { width: floodResolution, height: floodResolution },
    classify: (coord) => {
      'use gpu';
      const source = std.textureLoad(sourceLayout.$.source, coord, 0);
      return source.w > 0.5;
    },
    getSdf: (_coord, size, signedDist) => {
      'use gpu';
      const minDim = std.min(size.x, size.y);
      return signedDist / d.f32(minDim);
    },
    getColor: (_coord, _size, _signedDist, insidePx) => {
      'use gpu';
      const source = std.textureLoad(sourceLayout.$.source, insidePx, 0);
      return d.vec4f(source.xyz, 1);
    },
  })
  .with(sourceBindGroup);

floodRunner.run();

const floodSdfView = floodRunner.sdfOutput.createView();
const floodColorView = floodRunner.colorOutput.createView();
const sampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const renderRoundedBox = tgpu.fn(
  [d.vec2f],
  d.vec4f,
)((uv) => {
  'use gpu';
  const p = uv - 0.5;
  const dist = sdf.sdRoundedBox2d(p, d.vec2f(0.26, 0.12), 0.04);
  const edge = std.max(std.fwidth(dist), 0.001);
  const alpha = 1 - std.smoothstep(-edge, edge, dist);
  const glow = std.exp(-std.abs(dist) * 28) * 0.2;

  const bg = std.mix(d.vec3f(0.93, 0.95, 0.97), d.vec3f(0.74, 0.82, 0.95), uv.y);
  const fill = d.vec3f(0.08, 0.08, 0.1);
  const color = std.mix(bg, fill, alpha) + d.vec3f(1, 0.55, 0.28) * glow;

  return d.vec4f(std.min(color, d.vec3f(1)), 1);
});

const renderSmoothUnion = tgpu.fn(
  [d.vec2f],
  d.vec4f,
)((uv) => {
  'use gpu';
  const p = (uv - 0.5) * 1.08;
  const dist = smoothSceneSdf(p);
  const edge = std.max(std.fwidth(dist), 0.001);
  const alpha = 1 - std.smoothstep(-edge, edge, dist);
  const glow = std.exp(-std.abs(dist) * 26) * 0.2;
  const shade = std.smoothstep(-0.28, 0.08, dist) * 0.025;

  const bg = std.mix(d.vec3f(0.93, 0.95, 0.97), d.vec3f(0.74, 0.82, 0.95), uv.y);
  const fill = d.vec3f(0.07 + shade, 0.075 + shade, 0.095 + shade);
  const color = std.mix(bg, fill, alpha) + d.vec3f(1, 0.55, 0.28) * glow;

  return d.vec4f(std.min(color, d.vec3f(1)), 1);
});

const renderRayMarching = tgpu.fn(
  [d.vec2f],
  d.vec4f,
)((uv) => {
  'use gpu';
  const screen = uv * 2 - 1;
  const ro = d.vec3f(0, 0.05, -2.4);
  const rd = std.normalize(d.vec3f(screen, 1.25));
  const result = march(ro, rd);
  const bg = std.mix(d.vec3f(0.93, 0.95, 0.97), d.vec3f(0.74, 0.82, 0.95), uv.y);
  const vignette = 1 - std.smoothstep(0.72, 1.42, std.length(screen));
  const field = bg * (0.92 + vignette * 0.08);
  const shadowUv = d.vec2f(screen.x * 1.15, screen.y + 0.34);
  const shadow = std.exp(-(shadowUv.x * shadowUv.x * 4.2 + shadowUv.y * shadowUv.y * 18)) * 0.15;

  if (result.y < 0.5) {
    return d.vec4f(field - d.vec3f(0.18, 0.2, 0.24) * shadow, 1);
  }

  const p = ro + rd * result.x;
  const normal = normalAt(p);
  const lightDir = std.normalize(d.vec3f(-0.35, 0.7, -0.55));
  const fillDir = std.normalize(d.vec3f(0.55, -0.12, -0.82));
  const viewDir = std.normalize(rd * -1);

  const diffuse = std.max(std.dot(normal, lightDir), 0);
  const fillDiffuse = std.max(std.dot(normal, fillDir), 0);
  const facing = std.max(std.dot(normal, viewDir), 0);
  const front = std.max(normal.z * -1, 0);
  const top = std.max(normal.y, 0);
  const rim = (1 - facing) ** 2;
  const halfVector = std.normalize(lightDir + viewDir);
  const specular = std.max(std.dot(normal, halfVector), 0) ** 18;
  const side = std.smoothstep(-0.32, 0.38, p.x);

  const fill = std.mix(d.vec3f(0.038, 0.042, 0.06), d.vec3f(0.09, 0.1, 0.13), side);
  const shaded =
    fill * (0.22 + diffuse * 0.9 + fillDiffuse * 0.22) +
    d.vec3f(0.16, 0.18, 0.23) * front * 0.3 +
    d.vec3f(0.2, 0.22, 0.26) * top * 0.18;
  const sheen = d.vec3f(0.72, 0.77, 0.86) * specular * 0.34;
  const warmRim = d.vec3f(1, 0.55, 0.28) * rim * 0.38;
  const color = shaded + sheen + warmRim;

  return d.vec4f(std.min(color, d.vec3f(1)), 1);
});

const renderJumpFlood = tgpu.fn(
  [d.vec2f],
  d.vec4f,
)((uv) => {
  'use gpu';
  const dist = std.textureSampleLevel(floodSdfView.$, sampler.$, uv, 0).x;
  const seed = std.textureSampleLevel(floodColorView.$, sampler.$, uv, 0).xyz;
  const edge = std.max(std.fwidth(dist), 0.0015);
  const alpha = 1 - std.smoothstep(-edge, edge, dist);
  const glow = std.exp(-std.abs(dist) * 28) * 0.18;
  const band = std.abs(std.fract(std.abs(dist) * 22) - 0.5);
  const contour =
    (1 - std.smoothstep(0.46, 0.5, band)) * std.smoothstep(0.012, 0.04, std.abs(dist)) * 0.12;

  const bg = std.mix(d.vec3f(0.93, 0.95, 0.97), d.vec3f(0.74, 0.82, 0.95), uv.y);
  const field = bg + d.vec3f(0.36, 0.5, 0.76) * contour;
  const fill = d.vec3f(0.07, 0.075, 0.095) + seed * 0.045;
  const color = std.mix(field, fill, alpha) + d.vec3f(1, 0.55, 0.28) * glow;

  return d.vec4f(std.min(color, d.vec3f(1)), 1);
});

const fragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  if (snippetMode.$ === 1) {
    return renderSmoothUnion(uv);
  }
  if (snippetMode.$ === 2) {
    return renderRayMarching(uv);
  }
  if (snippetMode.$ === 3) {
    return renderJumpFlood(uv);
  }
  return renderRoundedBox(uv);
});

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment,
  targets: { format: presentationFormat },
});

let frameId = requestAnimationFrame(frame);
function frame() {
  pipeline.withColorAttachment({ view: context }).draw(3);
  frameId = requestAnimationFrame(frame);
}

function setSnippet(snippet: SdfSnippet) {
  snippetMode.write(SDF_SNIPPETS.indexOf(snippet));
}

export const controls = defineControls({
  Snippet: {
    initial: SDF_SNIPPETS[0],
    options: SDF_SNIPPETS,
    onSelectChange: setSnippet,
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  floodRunner.destroy();
  sourceTexture.destroy();
  root.destroy();
}
