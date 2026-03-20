import { randf, randomGeneratorSlot } from '@typegpu/noise';
import tgpu, { common, d, std, type TgpuRenderPipeline } from 'typegpu';

import * as c from './constants.ts';
import { initialPRNG, prngKeys, prngs, type PRNGKey } from './prngs.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const Config = d.struct({
  gridSize: d.f32,
  canvasRatio: d.f32,
  useSeed2: d.u32,
});

const configUniform = root.createUniform(Config, {
  gridSize: c.initialGridSize,
  canvasRatio: canvas.width / canvas.height,
  useSeed2: d.u32(prngs[initialPRNG].useSeed2),
});

const fragmentShader = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  'use gpu';
  const gridSize = configUniform.$.gridSize;
  const uv = input.uv * d.vec2f(configUniform.$.canvasRatio, 1);
  const gridedUV = std.floor(uv * gridSize);

  if (configUniform.$.useSeed2 === 1) {
    randf.seed2(gridedUV);
  } else {
    randf.seed(gridedUV.x * gridSize + gridedUV.y);
  }

  return d.vec4f(d.vec3f(randf.sample()), 1);
});

const pipelineCache = new Map<PRNGKey, TgpuRenderPipeline<d.Vec4f>>();
let prng: PRNGKey = initialPRNG;

const redraw = () => {
  let pipeline = pipelineCache.get(prng);
  if (!pipeline) {
    pipeline = root.with(randomGeneratorSlot, prngs[prng].generator).createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: fragmentShader,
      targets: { format: presentationFormat },
    });
    pipelineCache.set(prng, pipeline);
  }

  pipeline.withColorAttachment({ view: context }).draw(3);
};

// #region Example controls & Cleanup
export const controls = defineControls({
  PRNG: {
    initial: initialPRNG,
    options: prngKeys,
    onSelectChange: (value) => {
      prng = value;
      configUniform.writePartial({ useSeed2: d.u32(prngs[value].useSeed2) });
      redraw();
    },
  },
  'Grid Size': {
    initial: c.initialGridSize,
    options: c.gridSizes,
    onSelectChange: (value) => {
      configUniform.writePartial({ gridSize: value });
      redraw();
    },
  },
  // this is the only place where some niche prngs are tested
  'Test Resolution': import.meta.env.DEV && {
    onButtonClick: () => {
      prngKeys
        .map((key) =>
          tgpu.resolve([
            root.with(randomGeneratorSlot, prngs[key].generator).createRenderPipeline({
              vertex: common.fullScreenTriangle,
              fragment: fragmentShader,
            }),
          ]),
        )
        .forEach((r) => root.device.createShaderModule({ code: r }));
    },
  },
});

const resizeObserver = new ResizeObserver(() => {
  configUniform.writePartial({ canvasRatio: canvas.width / canvas.height });
  redraw();
});
resizeObserver.observe(canvas);

export function onCleanup() {
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
