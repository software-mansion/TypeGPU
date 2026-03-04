import { sdRoundedBox2d } from '@typegpu/sdf';
import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const mousePosUniform = root.createUniform(d.vec2f, d.vec2f(0.5, 0.5));

const response = await fetch('/TypeGPU/plums.jpg');
const imageBitmap = await createImageBitmap(await response.blob());

const imageTexture = root['~unstable']
  .createTexture({
    size: [imageBitmap.width, imageBitmap.height, 1],
    format: 'rgba8unorm',
    mipLevelCount: 6,
  })
  .$usage('sampled', 'render');
imageTexture.write(imageBitmap);
imageTexture.generateMipmaps();

const sampledView = imageTexture.createView();
const sampler = root['~unstable'].createSampler({
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
const defaultParams = {
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

const Weights = d.struct({
  inside: d.f32,
  ring: d.f32,
  outside: d.f32,
});

const TintParams = d.struct({
  color: d.vec3f,
  strength: d.f32,
});

const calculateWeights = (sdfDist: number, start: number, end: number, featherUV: number) => {
  'use gpu';
  const inside = 1 - std.smoothstep(start - featherUV, start + featherUV, sdfDist);
  const outside = std.smoothstep(end - featherUV, end + featherUV, sdfDist);
  const ring = std.max(0, 1 - inside - outside);
  return Weights({ inside, ring, outside });
};

const applyTint = (color: d.v3f, tint: d.Infer<typeof TintParams>) => {
  'use gpu';
  return std.mix(d.vec4f(color, 1), d.vec4f(tint.color, 1), tint.strength);
};

const sampleWithChromaticAberration = (
  tex: d.texture2d<d.F32>,
  sampler: d.sampler,
  uv: d.v2f,
  offset: number,
  dir: d.v2f,
  blur: number,
) => {
  'use gpu';
  const samples = d.arrayOf(d.vec3f, 3)();
  for (const i of tgpu.unroll([0, 1, 2])) {
    const channelOffset = dir.mul((d.f32(i) - 1.0) * offset);
    samples[i] = std.textureSampleBias(tex, sampler, uv.sub(channelOffset), blur).rgb;
  }
  return d.vec3f(samples[0].x, samples[1].y, samples[2].z);
};

const fragmentShader = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const posInBoxSpace = uv.sub(mousePosUniform.$);
  const sdfDist = sdRoundedBox2d(posInBoxSpace, paramsUniform.$.rectDims, paramsUniform.$.radius);
  const dir = std.normalize(posInBoxSpace.mul(paramsUniform.$.rectDims.yx));
  const normalizedDist =
    (sdfDist - paramsUniform.$.start) / (paramsUniform.$.end - paramsUniform.$.start);

  const texDim = std.textureDimensions(sampledView.$, 0);
  const featherUV = paramsUniform.$.edgeFeather / std.max(texDim.x, texDim.y);
  const weights = calculateWeights(sdfDist, paramsUniform.$.start, paramsUniform.$.end, featherUV);

  const blurSample = std.textureSampleBias(sampledView.$, sampler.$, uv, paramsUniform.$.blur);
  const refractedSample = sampleWithChromaticAberration(
    sampledView.$,
    sampler.$,
    uv.add(dir.mul(paramsUniform.$.refractionStrength * normalizedDist)),
    paramsUniform.$.chromaticStrength * normalizedDist,
    dir,
    paramsUniform.$.blur * paramsUniform.$.edgeBlurMultiplier,
  );
  const normalSample = std.textureSampleLevel(sampledView.$, sampler.$, uv, 0);

  const tint = TintParams({
    color: paramsUniform.$.tintColor,
    strength: paramsUniform.$.tintStrength,
  });

  const tintedBlur = applyTint(blurSample.rgb, tint);
  const tintedRing = applyTint(refractedSample, tint);

  return tintedBlur
    .mul(weights.inside)
    .add(tintedRing.mul(weights.ring))
    .add(normalSample.mul(weights.outside));
});

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: fragmentShader,
});

let isRectangleFixed = false;

function updatePosition(clientX: number, clientY: number) {
  if (isRectangleFixed) {
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  mousePosUniform.write(std.clamp(d.vec2f(x, y), d.vec2f(), d.vec2f(1)));
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
  pipeline.withColorAttachment({ view: context }).draw(3);
}
frameId = requestAnimationFrame(render);

export const controls = defineControls({
  'Rectangle dims': {
    initial: defaultParams.rectDims,
    min: d.vec2f(0.01, 0.01),
    max: d.vec2f(0.5, 0.5),
    step: d.vec2f(0.01, 0.01),
    onVectorSliderChange: (v) => {
      paramsUniform.writePartial({
        rectDims: d.vec2f(...(v as [number, number])),
      });
    },
  },
  'Corner radius': {
    initial: defaultParams.radius,
    min: 0.0,
    max: 0.05,
    step: 0.001,
    onSliderChange: (v) => {
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
    onSliderChange: (v) => {
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
    onSliderChange: (v) => {
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
    onSliderChange: (v) => {
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
    onSliderChange: (v) => {
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
    onSliderChange: (v) => {
      paramsUniform.writePartial({ blur: v });
    },
  },
  'Edge blur multiplier': {
    initial: defaultParams.edgeBlurMultiplier,
    min: 0.0,
    max: 1.0,
    step: 0.05,
    onSliderChange: (v) => {
      paramsUniform.writePartial({ edgeBlurMultiplier: v });
    },
  },
  'Feather ammount': {
    initial: defaultParams.edgeFeather,
    min: 0.0,
    max: 3.0,
    step: 0.1,
    onSliderChange: (v) => {
      paramsUniform.writePartial({ edgeFeather: v });
    },
  },
  'Tint strength': {
    initial: defaultParams.tintStrength,
    min: 0.0,
    max: 1.0,
    step: 0.01,
    onSliderChange: (v) => {
      paramsUniform.writePartial({ tintStrength: v });
    },
  },
  'Tint color': {
    initial: defaultParams.tintColor,
    onColorChange: (rgb) => {
      paramsUniform.writePartial({
        tintColor: d.vec3f(...(rgb as [number, number, number])),
      });
    },
  },
});

export function onCleanup() {
  if (frameId) {
    cancelAnimationFrame(frameId);
  }
  window.removeEventListener('mousemove', handleMouseMove);
  root.destroy();
}
