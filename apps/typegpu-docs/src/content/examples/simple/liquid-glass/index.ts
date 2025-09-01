import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { sdRoundedBox2d } from '@typegpu/sdf';
import { loadExternalImageWithMipmaps } from './mipmaps.ts';
import { fullScreenTriangle } from './common.ts';

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const mousePosUniform = root.createUniform(d.vec2f);

const { sampledView, sampler } = await loadExternalImageWithMipmaps(
  root,
  '/TypeGPU/plums.jpg',
);

const Params = d.struct({
  rectDims: d.vec2f,
  radius: d.f32,
  start: d.f32,
  end: d.f32,
  chromaticStrength: d.f32,
  refractionStrength: d.f32,
  blur: d.f32,
  edgeFeather: d.f32,
});
const defaultParams: d.Infer<typeof Params> = {
  rectDims: d.vec2f(0.13, 0.01),
  radius: 0.003,
  start: 0.05,
  end: 0.1,
  chromaticStrength: 0.02,
  refractionStrength: 0.1,
  blur: 1.2,
  edgeFeather: 2.0,
};

const paramsUniform = root.createUniform(Params, defaultParams);

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const sampleWithChromaticAberration = tgpu.fn(
  [d.vec2f, d.f32, d.vec2f],
  d.vec3f,
)(
  (uv, offset, dir) => {
    const red = std.textureSampleBias(
      sampledView,
      sampler,
      uv.add(dir.mul(offset)),
      paramsUniform.$.blur,
    );
    const green = std.textureSampleBias(
      sampledView,
      sampler,
      uv,
      paramsUniform.$.blur,
    );
    const blue = std.textureSampleBias(
      sampledView,
      sampler,
      uv.sub(dir.mul(offset)),
      paramsUniform.$.blur,
    );
    return d.vec3f(red.x, green.y, blue.z);
  },
);

const fragmentShader = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const mousePos = mousePosUniform.value;
  const posInBoxSpace = uv.sub(mousePos);

  const rectDims = paramsUniform.$.rectDims;
  const radius = paramsUniform.$.radius;
  const start = paramsUniform.$.start;
  const end = paramsUniform.$.end;

  const sampled = std.textureSampleLevel(sampledView, sampler, uv, 0);
  const blurSampled = std.textureSampleBias(
    sampledView,
    sampler,
    uv,
    paramsUniform.$.blur,
  );
  const sdfDist = sdRoundedBox2d(posInBoxSpace, rectDims, radius);

  const chromaticStrength = paramsUniform.$.chromaticStrength;
  const refractionStrength = paramsUniform.$.refractionStrength;

  const dir = std.normalize(posInBoxSpace.mul(rectDims.yx));

  const normalizedDist = (sdfDist - start) / (end - start);
  const chromaticOffset = chromaticStrength * normalizedDist;
  const refractedColor = sampleWithChromaticAberration(
    uv.add(dir.mul(refractionStrength * normalizedDist)),
    chromaticOffset,
    dir,
  );

  const dim = d.vec2f(std.textureDimensions(sampledView, 0));
  const featherUV = paramsUniform.$.edgeFeather / std.max(dim.x, dim.y);

  const insideBlurWeight = 1.0 -
    std.smoothstep(start - featherUV, start + featherUV, sdfDist);
  const outsideWeight = std.smoothstep(
    end - featherUV,
    end + featherUV,
    sdfDist,
  );
  const ringWeight = std.max(0.0, 1.0 - insideBlurWeight - outsideWeight);

  const ringColor = d.vec4f(refractedColor, 1.0);
  return blurSampled.mul(insideBlurWeight)
    .add(ringColor.mul(ringWeight))
    .add(sampled.mul(outsideWeight));
});

const pipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentShader, {
    format: presentationFormat,
  })
  .createPipeline();

let isRectangleFixed = false;
function updateMousePos(event: MouseEvent) {
  if (isRectangleFixed) return;
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return;
  mousePosUniform.write(d.vec2f(x, y));
}
canvas.addEventListener('mousemove', updateMousePos);
canvas.addEventListener('click', (e) => {
  isRectangleFixed = !isRectangleFixed;
  updateMousePos(e);
});

let frameId: number;
function render() {
  frameId = requestAnimationFrame(render);
  pipeline.withColorAttachment({
    view: context.getCurrentTexture().createView(),
    loadOp: 'clear',
    storeOp: 'store',
  }).draw(3);
  root['~unstable'].flush();
}
frameId = requestAnimationFrame(render);

export const controls = {
  'Rectangle dims': {
    initial: defaultParams.rectDims,
    min: d.vec2f(0.01, 0.01),
    max: d.vec2f(0.5, 0.5),
    step: d.vec2f(0.01, 0.01),
    onVectorSliderChange: (v: [number, number]) => {
      paramsUniform.writePartial({
        rectDims: d.vec2f(...v),
      });
    },
  },
  'Corner radius': {
    initial: defaultParams.radius,
    min: 0.0,
    max: 0.05,
    step: 0.001,
    onSliderChange: (v: number) => {
      paramsUniform.writePartial({
        radius: v,
      });
    },
  },
  'Edge start': {
    initial: defaultParams.start,
    min: 0.0,
    max: 0.1,
    step: 0.001,
    onSliderChange: (v: number) => {
      paramsUniform.writePartial({
        start: v,
      });
    },
  },
  'Edge end': {
    initial: defaultParams.end,
    min: 0.0,
    max: 0.2,
    step: 0.001,
    onSliderChange: (v: number) => {
      paramsUniform.writePartial({
        end: v,
      });
    },
  },
  'Chromatic strength': {
    initial: defaultParams.chromaticStrength,
    min: 0.0,
    max: 0.1,
    step: 0.001,
    onSliderChange: (v: number) => {
      paramsUniform.writePartial({
        chromaticStrength: v,
      });
    },
  },
  'Refraction strength': {
    initial: defaultParams.refractionStrength,
    min: 0.0,
    max: 0.2,
    step: 0.001,
    onSliderChange: (v: number) => {
      paramsUniform.writePartial({
        refractionStrength: v,
      });
    },
  },
  'Blur strength': {
    initial: defaultParams.blur,
    min: 0.0,
    max: 6.0,
    step: 0.1,
    onSliderChange: (v: number) => {
      paramsUniform.writePartial({ blur: v });
    },
  },
  'Feather ammount': {
    initial: defaultParams.edgeFeather,
    min: 0.0,
    max: 3.0,
    step: 0.1,
    onSliderChange: (v: number) => {
      paramsUniform.writePartial({ edgeFeather: v });
    },
  },
};

export function onCleanup() {
  if (frameId) {
    cancelAnimationFrame(frameId);
  }
  root.destroy();
}
