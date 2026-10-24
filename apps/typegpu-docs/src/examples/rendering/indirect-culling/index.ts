import { d, std, tgpu } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const counter = document.querySelector('#counter') as HTMLElement;

const FLOWER_COUNT = 20_000;
const WORLD_SIZE = 6;
const SEGMENTS = 64;
const WORKGROUP_SIZE = 64;

const Flower = d.struct({ position: d.vec2f, size: d.f32, hue: d.f32 });
const DrawArgs = d.struct({
  vertexCount: d.u32,
  instanceCount: d.atomic(d.u32),
  firstVertex: d.u32,
  firstInstance: d.u32,
});

const Scene = d.struct({
  draw: DrawArgs,
  flowers: d.align(256, d.arrayOf(Flower, FLOWER_COUNT)),
  visible: d.align(256, d.arrayOf(d.u32, FLOWER_COUNT)),
});

const scene = root.createBuffer(Scene).$usage('storage', 'vertex', 'indirect');
const drawArgs = scene.region(DrawArgs, (s) => s.draw);
const flowers = scene.region(d.arrayOf(Flower, FLOWER_COUNT), (s) => s.flowers);
const visible = scene.region(d.arrayOf(d.u32, FLOWER_COUNT), (s) => s.visible);

const Params = d.struct({ camera: d.vec2f, frame: d.f32, time: d.f32 });
const params = root.createUniform(Params);

const toView = (position: d.v2f) => {
  'use gpu';
  return (std.fract((position - params.$.camera) / WORLD_SIZE + 0.5) - 0.5) * WORLD_SIZE;
};

const flowersMutable = flowers.as('mutable');
const drawArgsMutable = drawArgs.as('mutable');
const visibleMutable = visible.as('mutable');
const survivorCount = tgpu.workgroupVar(d.atomic(d.u32));
const survivorBase = tgpu.workgroupVar(d.u32);

const cull = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: { gid: d.builtin.globalInvocationId, lid: d.builtin.localInvocationIndex },
})(({ gid, lid }) => {
  'use gpu';
  let keep = false;
  if (gid.x < FLOWER_COUNT) {
    const flower = flowersMutable.$[gid.x];
    const position = toView(flower.position);
    keep = std.max(std.abs(position.x), std.abs(position.y)) < params.$.frame + flower.size;
  }

  let slot = d.u32(0);
  if (keep) {
    slot = std.atomicAdd(survivorCount.$, 1);
  }
  std.workgroupBarrier();

  if (lid === 0) {
    survivorBase.$ = std.atomicAdd(
      drawArgsMutable.$.instanceCount,
      std.atomicLoad(survivorCount.$),
    );
  }
  std.workgroupBarrier();

  if (keep) {
    visibleMutable.$[survivorBase.$ + slot] = gid.x;
  }
});

const cullPipeline = root.createComputePipeline({ compute: cull });

const flowersReadonly = flowers.as('readonly');
const indexLayout = tgpu.vertexLayout(d.arrayOf(d.u32), 'instance');

const renderPipeline = root
  .createRenderPipeline({
    attribs: { index: indexLayout.attrib },
    vertex: ({ index, $vertexIndex }) => {
      'use gpu';
      const flower = flowersReadonly.$[index];
      const edge = d.f32(std.min($vertexIndex % 3, 1));
      const angle =
        (std.floor($vertexIndex / 3) + d.f32($vertexIndex % 3) - 1) * ((Math.PI * 2) / SEGMENTS) +
        params.$.time * (flower.hue - 0.5);
      const petals = std.floor(3 + flower.hue * 5);
      const radius = flower.size * (0.65 + 0.35 * std.cos(petals * angle)) * edge;
      const position = toView(flower.position) + radius * d.vec2f(std.cos(angle), std.sin(angle));
      return { $position: d.vec4f(position, 0, 1), hue: flower.hue, edge };
    },
    fragment: ({ hue, edge }) => {
      'use gpu';
      const color = 0.5 + 0.5 * std.cos(6.2832 * (hue + d.vec3f(0, 0.33, 0.67)));
      return d.vec4f(color * (0.15 + 0.45 * edge), 1);
    },
    targets: {
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one' },
        alpha: { srcFactor: 'one', dstFactor: 'one' },
      },
    },
  })
  .with(indexLayout, visible);

flowers.write(
  Array.from({ length: FLOWER_COUNT }, () => ({
    position: d.vec2f((Math.random() - 0.5) * WORLD_SIZE, (Math.random() - 0.5) * WORLD_SIZE),
    size: 0.008 + Math.random() ** 4 * 0.06,
    hue: Math.random(),
  })),
);
drawArgs.write({ vertexCount: SEGMENTS * 3, instanceCount: 0, firstVertex: 0, firstInstance: 0 });

let culling = true;
let frameSize = 0.6;
let reading = false;
let frameId: number;

function frame(timestamp: number) {
  const time = timestamp / 1000;
  params.patch({ camera: d.vec2f(time * 0.1, Math.sin(time * 0.2)), time });
  drawArgs.patch({ instanceCount: 0 });

  const encoder = root['~unstable'].createCommandEncoder();
  cullPipeline.with(encoder).dispatchWorkgroups(Math.ceil(FLOWER_COUNT / WORKGROUP_SIZE));
  renderPipeline
    .with(encoder)
    .withColorAttachment({ view: context, clearValue: [0.02, 0.02, 0.04, 1] })
    .drawIndirect(drawArgs);
  encoder.submit();

  if (!reading) {
    reading = true;
    void drawArgs
      .read()
      .then(({ instanceCount }) => {
        counter.textContent = `${instanceCount} of ${FLOWER_COUNT} flowers drawn`;
        reading = false;
      })
      .catch(() => {});
  }

  frameId = requestAnimationFrame(frame);
}

frameId = requestAnimationFrame(frame);

function updateFrame() {
  params.patch({ frame: culling ? frameSize : WORLD_SIZE });
}

// #region Example controls and cleanup

export const controls = defineControls({
  culling: {
    initial: culling,
    onToggleChange: (value) => {
      culling = value;
      updateFrame();
    },
  },
  'frame size': {
    initial: frameSize,
    min: 0.1,
    max: 1.2,
    step: 0.05,
    onSliderChange: (value) => {
      frameSize = value;
      updateFrame();
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}

// #endregion
