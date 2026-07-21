import { tgpu, common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

const imageBlob = await (await fetch('/TypeGPU/plums.jpg')).blob();
const imageBitmap = await createImageBitmap(imageBlob);

const size = [512, 512] as const;

const [sourceTexture, targetTexture] = [0, 1].map(() =>
  root.createTexture({ size, format: 'rgba8unorm' }).$usage('sampled', 'render'),
);

sourceTexture.write(imageBitmap, { resize: true });
targetTexture.copyFrom(sourceTexture);

type Channel = 'r' | 'g' | 'b' | 'a';
type ChannelSource = Channel | 'none';

const channelSources: Record<Channel, ChannelSource> = { r: 'r', g: 'g', b: 'b', a: 'none' };
let clearColor = d.vec3f();

function writeSelectedChannels() {
  const channels: Partial<Record<Channel, { source: ImageBitmap; from: Channel }>> = {};
  for (const to of ['r', 'g', 'b', 'a'] as const) {
    const from = channelSources[to];
    if (from !== 'none') {
      channels[to] = { source: imageBitmap, from };
    }
  }
  common.writeChannels(targetTexture, channels, { size, resize: true });
}

function copyQuarterToCenter() {
  targetTexture.copyFrom(sourceTexture, {
    sourceOrigin: [0, 0],
    origin: [size[0] / 4, size[1] / 4],
    size: [size[0] / 2, size[1] / 2],
  });
}

function clearTarget() {
  targetTexture.clear([clearColor.x, clearColor.y, clearColor.z, 1]);
}

const channelUniform = root.createUniform(d.i32);

const sampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });
const sampledView = targetTexture.createView();

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const color = std.textureSample(sampledView.$, sampler.$, uv);

    if (channelUniform.$ === 1) {
      return d.vec4f(color.rrr, 1);
    }
    if (channelUniform.$ === 2) {
      return d.vec4f(color.ggg, 1);
    }
    if (channelUniform.$ === 3) {
      return d.vec4f(color.bbb, 1);
    }
    if (channelUniform.$ === 4) {
      return d.vec4f(color.aaa, 1);
    }

    return d.vec4f(color);
  },
});

function render() {
  pipeline.withColorAttachment({ view: context }).draw(3);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

const channelOptions = ['r', 'g', 'b', 'a', 'none'] as const;

export const controls = defineControls({
  'R from': {
    initial: channelSources.r,
    options: [...channelOptions],
    onSelectChange: (value) => {
      channelSources.r = value;
    },
  },
  'G from': {
    initial: channelSources.g,
    options: [...channelOptions],
    onSelectChange: (value) => {
      channelSources.g = value;
    },
  },
  'B from': {
    initial: channelSources.b,
    options: [...channelOptions],
    onSelectChange: (value) => {
      channelSources.b = value;
    },
  },
  'A from': {
    initial: channelSources.a,
    options: [...channelOptions],
    onSelectChange: (value) => {
      channelSources.a = value;
    },
  },
  'Write channels': {
    onButtonClick: () => writeSelectedChannels(),
  },
  'Copy full image': {
    onButtonClick: () => targetTexture.copyFrom(sourceTexture),
  },
  'Copy quarter to center': {
    onButtonClick: () => copyQuarterToCenter(),
  },
  'Clear color': {
    initial: clearColor,
    onColorChange: (value) => {
      clearColor = value;
    },
  },
  'Clear target': {
    onButtonClick: () => clearTarget(),
  },
  Channel: {
    initial: 'RGBA',
    options: ['RGBA', 'R', 'G', 'B', 'A'],
    onSelectChange: (value) => {
      channelUniform.write({ RGBA: 0, R: 1, G: 2, B: 3, A: 4 }[value] ?? 0);
    },
  },
});

export function onCleanup() {
  root.destroy();
}
