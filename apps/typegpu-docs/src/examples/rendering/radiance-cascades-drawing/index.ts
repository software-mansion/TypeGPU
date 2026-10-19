import * as hrc from '@typegpu/radiance-cascades/holographic';
import * as sdf from '@typegpu/sdf';
import { tgpu, common, d, std, type TgpuCommandEncoder } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { createDrawInteraction } from './drawInteraction.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

const size = 512;
const scene = root
  .createTexture({ size: [size, size], format: 'rgba16float' })
  .$usage('storage', 'sampled');
const sceneWrite = scene.createView(d.textureStorage2d('rgba16float'));
const sceneRead = scene.createView(d.texture2d(d.f32));
const sampler = root.createSampler({ magFilter: 'linear', minFilter: 'linear' });

const lighting = hrc.create({
  root,
  size: { width: size, height: size },
  medium: (pixel) => {
    'use gpu';
    const material = std.textureLoad(sceneRead.$, pixel, 0);
    return { emission: material.rgb * 16, extinction: material.a * 16 };
  },
});
const radiance = lighting.output.createView(d.texture2d(d.f32));
const sectors = lighting.sectors.createView(d.texture2dArray(d.f32));

const DrawSegment = d.struct({
  start: d.vec2f,
  end: d.vec2f,
  color: d.vec3f,
  radius: d.f32,
});

const segments = root.createReadonly(d.arrayOf(DrawSegment, 256));
const segmentCount = root.createUniform(d.u32);

const draw = root.createComputePipeline({
  compute: tgpu.computeFn({
    workgroupSize: [8, 8],
    in: { gid: d.builtin.globalInvocationId },
  })(({ gid }) => {
    'use gpu';
    const uv = (d.vec2f(gid.xy) + 0.5) / size;

    let color = d.vec4f();
    for (let i = d.u32(0); i < segmentCount.$; i++) {
      const segment = segments.$[i];
      let distance = std.length(uv - segment.start);
      if (std.any(std.ne(segment.start, segment.end))) {
        distance = sdf.sdLine(uv, segment.start, segment.end);
      }
      if (distance < segment.radius) {
        color = d.vec4f(segment.color, 1);
      }
    }

    if (color.a > 0) std.textureStore(sceneWrite.$, gid.xy, color);
  }),
});

const displayMode = root.createUniform(d.u32);

const display = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
    'use gpu';
    const material = std.textureSampleLevel(sceneRead.$, sampler.$, uv, 0);

    let light = std.textureSampleLevel(radiance.$, sampler.$, uv, 0).rgb;
    if (displayMode.$ >= 2) {
      light = std.textureSampleLevel(sectors.$, sampler.$, uv, displayMode.$ - 2, 0).rgb;
    }

    const color = std.select(
      material.rgb + light * (1 - material.a),
      material.rgb,
      displayMode.$ === 1,
    );
    return d.vec4f(color, 1);
  }),
});

const pending: d.InferInput<typeof DrawSegment>[] = [];
let brushRadius = 0.015;
let sceneDirty = false;

function stamp(encoder: TgpuCommandEncoder) {
  if (pending.length === 0) return;

  segments.patch(pending);
  segmentCount.write(pending.length);

  const pass = encoder.beginComputePass();
  draw.with(pass).dispatchWorkgroups(size / 8, size / 8);
  pass.end();

  pending.length = 0;
}

const interaction = createDrawInteraction({
  canvas,
  onDraw({ last, current, color }) {
    if (pending.length === 256) return;
    pending.push({
      start: [last?.x ?? current.x, last?.y ?? current.y],
      end: [current.x, current.y],
      color,
      radius: brushRadius,
    });
    sceneDirty = true;
  },
});

let frameId = requestAnimationFrame(frame);
function frame(timestamp: number) {
  interaction.update(timestamp);

  const encoder = root['~unstable'].createCommandEncoder();
  if (sceneDirty) {
    stamp(encoder);
    lighting.run({ encoder });
    sceneDirty = false;
  }

  const pass = encoder.beginRenderPass({ colorAttachments: { view: context } });
  display.with(pass).draw(3);
  pass.end();

  encoder.submit();
  frameId = requestAnimationFrame(frame);
}

// #region Example controls and cleanup

export const controls = defineControls({
  ...interaction.controls,
  'Brush Size': {
    initial: 0.015,
    min: 0.002,
    max: 0.15,
    step: 0.002,
    onSliderChange(value: number) {
      brushRadius = value;
    },
  },
  'Display Mode': {
    initial: 'Lighting',
    options: ['Lighting', 'Scene', '+X', '+Y', '−X', '−Y'],
    onSelectChange(value: string) {
      displayMode.write(['Lighting', 'Scene', '+X', '+Y', '−X', '−Y'].indexOf(value));
    },
  },
  Clear: {
    onButtonClick() {
      pending.length = 0;
      scene.clear();
      sceneDirty = true;
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}

// #endregion
