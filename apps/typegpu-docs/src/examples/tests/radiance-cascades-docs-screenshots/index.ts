import * as rc from '@typegpu/radiance-cascades';
import * as sdf from '@typegpu/sdf';
import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const RC_SNIPPETS = ['Basic usage', 'Generated SDF texture', 'Custom ray marching'] as const;
type RcSnippet = (typeof RC_SNIPPETS)[number];

const snippetMode = root.createUniform(d.u32);
const previewSize = { width: 512, height: 512 };
const floodResolution = 2048;

const sceneSdf = tgpu.fn([d.vec2f], d.f32)((uv) => {
  'use gpu';
  const circle = sdf.sdDisk(uv - d.vec2f(0.5), 0.18);
  const wall = sdf.sdRoundedBox2d(uv - d.vec2f(0.5, 0.82), d.vec2f(0.42, 0.03), 0.01);
  return sdf.opUnion(circle, wall);
});

const surfaceColor = tgpu.fn([d.vec2f], d.vec3f)((uv) => {
  'use gpu';
  return std.mix(d.vec3f(1, 0.82, 0.5), d.vec3f(0.28, 0.52, 1), uv.x);
});

const triangleEdge = (p: d.v2f, a: d.v2f, b: d.v2f) => {
  'use gpu';
  const ab = b - a;
  const ap = p - a;
  return ab.x * ap.y - ab.y * ap.x;
};

const basicRunner = rc.createRadianceCascades({
  root,
  size: previewSize,
  sdfResolution: { width: 1024, height: 1024 },
  sdf: sceneSdf,
  color: surfaceColor,
});

const customRunner = rc.createRadianceCascades({
  root,
  size: previewSize,
  sdfResolution: { width: 1024, height: 1024 },
  sdf: sceneSdf,
  color: surfaceColor,
  rayMarch: (probePos, rayDir, startT, endT, eps, minStep, bias) => {
    'use gpu';
    let color = d.vec3f();
    let transmittance = d.f32(1);
    let t = startT;

    for (let step = 0; step < 64; step++) {
      if (t > endT || transmittance < 0.02) {
        break;
      }

      const pos = probePos + rayDir * t;
      if (std.any(std.lt(pos, d.vec2f(0))) || std.any(std.gt(pos, d.vec2f(1)))) {
        break;
      }

      const signedDist = sceneSdf(pos);
      const stepSize = std.max(signedDist + bias, minStep);
      const haze = std.exp(-std.abs(signedDist) * 34) * stepSize * 18;
      const hazeColor = std.mix(d.vec3f(1, 0.38, 0.14), d.vec3f(0.22, 0.56, 1), pos.x);
      color += hazeColor * haze * transmittance;

      if (signedDist + bias <= eps) {
        color += surfaceColor(pos) * transmittance * 0.65;
        transmittance *= 0.35;
        break;
      }

      transmittance *= std.max(1 - haze * 0.08, 0.72);
      t += stepSize;
    }

    return rc.RayMarchResult({
      color,
      transmittance,
    });
  },
});

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

  const a = d.vec2f(0.32, 0.18);
  const b = d.vec2f(0.78, 0.55);
  const c = d.vec2f(0.32, 0.84);

  const e0 = triangleEdge(uv, a, b);
  const e1 = triangleEdge(uv, b, c);
  const e2 = triangleEdge(uv, c, a);

  let color = d.vec4f();
  if (e0 >= 0 && e1 >= 0 && e2 >= 0) {
    color = d.vec4f(surfaceColor(uv), 1);
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

const generatedRunner = rc.createRadianceCascades({
  root,
  size: previewSize,
  sdfResolution: { width: floodResolution, height: floodResolution },
  sdf: (uv) => {
    'use gpu';
    if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) {
      return 1;
    }
    return std.textureSampleLevel(floodSdfView.$, sampler.$, uv, 0).x;
  },
  color: (uv) => {
    'use gpu';
    return std.textureSampleLevel(floodColorView.$, sampler.$, uv, 0).xyz;
  },
});

basicRunner.run();
customRunner.run();
generatedRunner.run();

const basicView = basicRunner.output.createView(d.texture2d());
const customView = customRunner.output.createView(d.texture2d());
const generatedView = generatedRunner.output.createView(d.texture2d());

const composePreview = tgpu.fn([d.vec2f, d.vec3f, d.f32, d.vec3f, d.f32], d.vec4f)(
  (uv, radiance, dist, colorAtSurface, exposure) => {
    'use gpu';
    const edge = std.max(std.fwidth(dist), 0.001);
    const surface = 1 - std.smoothstep(-edge, edge, dist);
    const bg = std.mix(d.vec3f(0.04, 0.05, 0.07), d.vec3f(0.11, 0.15, 0.22), uv.y);
    const lit = bg + radiance * exposure;
    const color = std.mix(lit, colorAtSurface, surface);

    return d.vec4f(std.min(color, d.vec3f(1)), 1);
  },
);

const renderBasic = tgpu.fn([d.vec2f], d.vec4f)((uv) => {
  'use gpu';
  const radiance = std.textureSampleLevel(basicView.$, sampler.$, uv, 0).xyz;
  return composePreview(uv, radiance, sceneSdf(uv), surfaceColor(uv), 1.55);
});

const renderGenerated = tgpu.fn([d.vec2f], d.vec4f)((uv) => {
  'use gpu';
  const radiance = std.textureSampleLevel(generatedView.$, sampler.$, uv, 0).xyz;
  const dist = std.textureSampleLevel(floodSdfView.$, sampler.$, uv, 0).x;
  const color = std.textureSampleLevel(floodColorView.$, sampler.$, uv, 0).xyz;
  return composePreview(uv, radiance, dist, color, 1.45);
});

const renderCustom = tgpu.fn([d.vec2f], d.vec4f)((uv) => {
  'use gpu';
  const radiance = std.textureSampleLevel(customView.$, sampler.$, uv, 0).xyz;
  const dist = sceneSdf(uv);
  const edge = std.max(std.fwidth(dist), 0.001);
  const surface = 1 - std.smoothstep(-edge, edge, dist);
  const halo = std.exp(-std.abs(dist) * 24);

  const bg = std.mix(d.vec3f(0.025, 0.03, 0.045), d.vec3f(0.09, 0.12, 0.18), uv.y);
  const haze = std.mix(d.vec3f(1, 0.38, 0.14), d.vec3f(0.22, 0.56, 1), uv.x) * halo * 0.26;
  const lit = bg + radiance * 2.05 + haze;
  const surfaceTint = std.mix(surfaceColor(uv), d.vec3f(1, 0.52, 0.22), 0.3);
  const color = std.mix(lit, surfaceTint, surface);

  return d.vec4f(std.min(color, d.vec3f(1)), 1);
});

const fragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  if (snippetMode.$ === 1) {
    return renderGenerated(uv);
  }
  if (snippetMode.$ === 2) {
    return renderCustom(uv);
  }
  return renderBasic(uv);
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

function setSnippet(snippet: RcSnippet) {
  snippetMode.write(RC_SNIPPETS.indexOf(snippet));
}

export const controls = defineControls({
  Snippet: {
    initial: RC_SNIPPETS[0],
    options: RC_SNIPPETS,
    onSelectChange: setSnippet,
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  basicRunner.destroy();
  customRunner.destroy();
  generatedRunner.destroy();
  floodRunner.destroy();
  sourceTexture.destroy();
  root.destroy();
}
