import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
});

const imageBitmap = await createImageBitmap(
  await (await fetch('/TypeGPU/plums.jpg')).blob(),
);

const mipLevels = Math.floor(
  Math.log2(Math.min(imageBitmap.width, imageBitmap.height)),
) + 1;
console.log('Mip levels:', mipLevels);

const sourceTex = root['~unstable'].createTexture({
  size: [imageBitmap.width, imageBitmap.height],
  format: 'rgba16float',
  mipLevelCount: mipLevels,
}).$usage('render');
sourceTex.write(imageBitmap);

let texture = root['~unstable'].createTexture({
  size: [imageBitmap.width, imageBitmap.height],
  format: 'rgba16float',
  mipLevelCount: mipLevels,
}).$usage('sampled', 'render');
texture.copyFrom(sourceTex);
texture.generateMipmaps();

const filteringSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const layout = tgpu.bindGroupLayout({
  myTexture: { texture: d.texture2d(d.f32) },
});
let bindGroup = root.createBindGroup(layout, {
  myTexture: texture,
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
const biasUniform = root.createUniform(d.f32);

const fragmentFunction = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})`{
  let color = textureSampleBias(texture, sampler, in.uv, bias);
  return color;
}`.$uses({
  texture: layout.bound.myTexture,
  sampler: filteringSampler,
  bias: biasUniform,
});

const pipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentFunction, { format: presentationFormat })
  .createPipeline();

function render() {
  pipeline
    .with(bindGroup)
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);
  root['~unstable'].flush();
  requestAnimationFrame(render);
}
requestAnimationFrame(render);

export const controls = {
  'Randomize size': {
    onButtonClick: () => {
      const newSize = [
        Math.floor(Math.random() * 2048) + 1,
        Math.floor(Math.random() * 2048) + 1,
      ] as const;
      const mipLevels = Math.floor(
        Math.log2(Math.min(newSize[0], newSize[1])),
      ) + 1;
      console.log('New size:', newSize, 'Mip levels:', mipLevels);
      texture = root['~unstable']
        .createTexture({
          size: newSize,
          format: 'rgba16float',
          mipLevelCount: mipLevels,
        })
        .$usage('sampled', 'render');
      texture.write(imageBitmap);
      texture.generateMipmaps();
      bindGroup = root.createBindGroup(layout, {
        myTexture: texture,
      });
    },
  },
  'Mip bias': {
    initial: 0,
    min: -16,
    max: 16,
    step: 0.1,
    onSliderChange: (value: number) => {
      biasUniform.write(value);
    },
  },
  Clear: {
    onButtonClick: () => texture.clear(),
  },
};

export function onCleanup() {
  root.destroy();
}
