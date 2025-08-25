import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { sdRoundedBox2d } from '@typegpu/sdf';

const cat = await fetch('/TypeGPU/cat.webp');
const imageBitmap = await createImageBitmap(await cat.blob());

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const mousePosUniform = root.createUniform(d.vec2f);
const sampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});
const imageTexture = root['~unstable'].createTexture({
  size: [imageBitmap.width, imageBitmap.height],
  format: 'rgba8unorm',
}).$usage('sampled', 'render');
const sampledView = imageTexture.createView('sampled');

device.queue.copyExternalImageToTexture(
  { source: imageBitmap },
  { texture: root.unwrap(imageTexture) },
  [imageBitmap.width, imageBitmap.height],
);

const Params = d.struct({
  rectDims: d.vec2f,
  radius: d.f32,
  start: d.f32,
  end: d.f32,
  chromaticStrength: d.f32,
  refractionStrength: d.f32,
});
const defaultParams: d.Infer<typeof Params> = {
  rectDims: d.vec2f(0.13, 0.01),
  radius: 0.003,
  start: 0.05,
  end: 0.1,
  chromaticStrength: 0.02,
  refractionStrength: 0.1,
};

const paramsUniform = root.createUniform(Params, defaultParams);

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
  const uv = [d.vec2f(0, 1), d.vec2f(2, 1), d.vec2f(0, -1)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0, 1),
    uv: uv[input.vertexIndex],
  };
});

const sampleWithChromaticAberration = tgpu.fn([d.vec2f, d.f32], d.vec3f)(
  (uv, offset) => {
    const red = std.textureSampleLevel(
      sampledView,
      sampler,
      uv.add(d.vec2f(offset, 0)),
      0,
    );
    const green = std.textureSampleLevel(
      sampledView,
      sampler,
      uv,
      0,
    );
    const blue = std.textureSampleLevel(
      sampledView,
      sampler,
      uv.sub(d.vec2f(offset, 0)),
      0,
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
  const sdfDist = sdRoundedBox2d(posInBoxSpace, rectDims, radius);

  if (sdfDist > end || sdfDist < start) {
    return sampled;
  }

  const chromaticStrength = paramsUniform.$.chromaticStrength;
  const refractionStrength = paramsUniform.$.refractionStrength;

  const dir = std.normalize(posInBoxSpace.mul(rectDims.yx));

  const normalizedDist = (sdfDist - start) / (end - start);
  const chromaticOffset = chromaticStrength * normalizedDist;
  const refractedColor = sampleWithChromaticAberration(
    uv.add(dir.mul(refractionStrength * normalizedDist)),
    chromaticOffset,
  );

  return d.vec4f(refractedColor, 1.0);
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
};

export function onCleanup() {
  if (frameId) {
    cancelAnimationFrame(frameId);
  }
  root.destroy();
}
