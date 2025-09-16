import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { sdRoundedBox2d } from '@typegpu/sdf';
import { fullScreenTriangle } from './common.ts';

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const mousePosUniform = root.createUniform(d.vec2f, d.vec2f(0.5, 0.5));

const response = await fetch('/TypeGPU/plums.jpg');
const imageBitmap = await createImageBitmap(await response.blob());

const imageTexture = root['~unstable'].createTexture({
  size: [imageBitmap.width, imageBitmap.height, 1],
  format: 'rgba8unorm',
  mipLevelCount: 6,
}).$usage('sampled', 'render');
imageTexture.write(imageBitmap);
imageTexture.generateMipmaps();

const sampledView = imageTexture.createView();
const sampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
});

const Params = d.struct({
  rectDims: d.vec2f,
  radius: d.f32,
  start: d.f32,
  end: d.f32,
  chromaticStrength: d.f32,
  refractionStrength: d.f32,
  blur: d.f32,
  edgeFeather: d.f32,
  edgeBlurMultiplier: d.f32,
  tintStrength: d.f32,
  tintColor: d.vec3f,
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
  edgeBlurMultiplier: 0.7,
  tintStrength: 0.05,
  tintColor: d.vec3f(0.58, 0.44, 0.96),
};

const paramsUniform = root.createUniform(Params, defaultParams);

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const sampleWithChromaticAberration = tgpu.fn(
  [d.vec2f, d.f32, d.vec2f, d.f32],
  d.vec3f,
)((uv, offset, dir, blur) => {
  const red = std.textureSampleBias(
    sampledView.$,
    sampler,
    uv.add(dir.mul(offset)),
    blur,
  );
  const green = std.textureSampleBias(
    sampledView.$,
    sampler,
    uv,
    blur,
  );
  const blue = std.textureSampleBias(
    sampledView.$,
    sampler,
    uv.sub(dir.mul(offset)),
    blur,
  );
  return d.vec3f(red.x, green.y, blue.z);
});

const fragmentShader = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const mousePos = mousePosUniform.$;
  const posInBoxSpace = uv.sub(mousePos);

  const rectDims = paramsUniform.$.rectDims;
  const start = paramsUniform.$.start;
  const end = paramsUniform.$.end;
  const blurStrength = paramsUniform.$.blur;
  const tintColor = paramsUniform.$.tintColor;
  const tintStrength = paramsUniform.$.tintStrength;

  const sdfDist = sdRoundedBox2d(
    posInBoxSpace,
    rectDims,
    paramsUniform.$.radius,
  );

  const dir = std.normalize(posInBoxSpace.mul(rectDims.yx));
  const normalizedDist = (sdfDist - start) / (end - start);
  const chromaticOffset = paramsUniform.$.chromaticStrength * normalizedDist;

  const sampled = std.textureSampleLevel(sampledView.$, sampler, uv, 0);
  const blurSampled = std.textureSampleBias(
    sampledView.$,
    sampler,
    uv,
    blurStrength,
  );
  const refractedColor = sampleWithChromaticAberration(
    uv.add(dir.mul(paramsUniform.$.refractionStrength * normalizedDist)),
    chromaticOffset,
    dir,
    blurStrength * paramsUniform.$.edgeBlurMultiplier,
  );

  const dim = d.vec2f(std.textureDimensions(sampledView.$, 0));
  const featherUV = paramsUniform.$.edgeFeather / std.max(dim.x, dim.y);

  const insideBlurWeight = 1 -
    std.smoothstep(start - featherUV, start + featherUV, sdfDist);
  const outsideWeight = std.smoothstep(
    end - featherUV,
    end + featherUV,
    sdfDist,
  );
  const ringWeight = std.max(0, 1 - insideBlurWeight - outsideWeight);

  const tintedBlurSampled = std.mix(
    d.vec4f(blurSampled.xyz, 1),
    d.vec4f(tintColor, 1),
    tintStrength,
  );
  const tintedRingColor = std.mix(
    d.vec4f(refractedColor, 1),
    d.vec4f(tintColor, 1),
    tintStrength,
  );

  return tintedBlurSampled.mul(insideBlurWeight)
    .add(tintedRingColor.mul(ringWeight))
    .add(sampled.mul(outsideWeight));
});

const pipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentShader, {
    format: presentationFormat,
  })
  .createPipeline();

let isRectangleFixed = false;

function updatePosition(clientX: number, clientY: number) {
  if (isRectangleFixed) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  mousePosUniform.write(
    std.clamp(d.vec2f(x, y), d.vec2f(), d.vec2f(1)),
  );
}

function handleMouseMove(event: MouseEvent) {
  updatePosition(event.clientX, event.clientY);
}

function handleTouchMove(event: TouchEvent) {
  event.preventDefault();
  const touch = event.touches[0];
  updatePosition(touch.clientX, touch.clientY);
}

function handleClick(event: MouseEvent) {
  isRectangleFixed = !isRectangleFixed;
  updatePosition(event.clientX, event.clientY);
}

function handleTouchStart(event: TouchEvent) {
  isRectangleFixed = !isRectangleFixed;
  const touch = event.touches[0];
  updatePosition(touch.clientX, touch.clientY);
}

window.addEventListener('mousemove', handleMouseMove);
canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
canvas.addEventListener('click', handleClick);

let frameId: number;
function render() {
  frameId = requestAnimationFrame(render);
  pipeline.withColorAttachment({
    view: context.getCurrentTexture().createView(),
    loadOp: 'clear',
    storeOp: 'store',
  }).draw(3);
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
  'Edge blur multiplier': {
    initial: defaultParams.edgeBlurMultiplier,
    min: 0.0,
    max: 1.0,
    step: 0.05,
    onSliderChange: (v: number) => {
      paramsUniform.writePartial({ edgeBlurMultiplier: v });
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
  'Tint strength': {
    initial: defaultParams.tintStrength,
    min: 0.0,
    max: 1.0,
    step: 0.01,
    onSliderChange: (v: number) => {
      paramsUniform.writePartial({ tintStrength: v });
    },
  },
  'Tint color': {
    initial: defaultParams.tintColor,
    onColorChange: (rgb: [number, number, number]) => {
      paramsUniform.writePartial({ tintColor: d.vec3f(...rgb) });
    },
  },
};

export function onCleanup() {
  if (frameId) {
    cancelAnimationFrame(frameId);
  }
  window.removeEventListener('mousemove', handleMouseMove);
  root.destroy();
}
