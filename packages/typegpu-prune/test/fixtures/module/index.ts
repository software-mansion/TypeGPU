// A module the way the ecosystem packages are written: a definition built inside precompile(),
// and an instance created at runtime from nothing but the definition and the root, recording
// into whatever it's handed
import {
  common,
  d,
  std,
  tgpu,
  type TgpuCommandEncoder,
  type TgpuComputePass,
  type TgpuRenderCommands,
} from 'typegpu';
import { init, precompile } from '@typegpu/prune';

const define = precompile((root) => {
  const Particle = d.struct({ position: d.vec2f, velocity: d.vec2f, mass: d.f32 });
  const Particles = d.arrayOf(Particle);
  const Weights = d.arrayOf(d.f32);
  const Output = d.textureStorage2d('rgba8unorm', 'write-only');

  const layout = tgpu.bindGroupLayout({
    particles: { storage: Particles, access: 'mutable' },
    weights: { storage: Weights },
    output: { storageTexture: Output },
  });
  const drawLayout = tgpu.bindGroupLayout({ image: { texture: d.texture2d() } });

  const step = tgpu.computeFn({ workgroupSize: [64], in: { id: d.builtin.globalInvocationId } })((
    input,
  ) => {
    'use gpu';
    const particle = layout.$.particles[input.id.x] as d.Infer<typeof Particle>;
    particle.position = particle.position.add(
      particle.velocity.mul(layout.$.weights[input.id.x] as number),
    );
    std.textureStore(layout.$.output, d.vec2u(input.id.x, 0), d.vec4f(particle.position, 0, 1));
  });
  const fragment = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })((input) => {
    'use gpu';
    return std.textureLoad(drawLayout.$.image, d.vec2i(input.uv.mul(8)), 0);
  });

  return {
    Particles,
    Weights,
    Positions: d.disarrayOf(d.vec2f),
    Output,
    layout,
    drawLayout,
    step: root.createComputePipeline({ compute: step }),
    draw: root.createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment,
      targets: { format: 'rgba8unorm' },
    }),
  };
});

// --- The instance: only buffers, textures, bind groups and recording

const root = await init();
const definition = define(root);
const count = 5;

const particles = root.createBuffer(definition.Particles(count)).$usage('storage');
particles.write(
  Array.from({ length: count }, (_, i) => ({
    position: [i, -i],
    velocity: [0.5, i / 4],
    mass: i + 1,
  })),
);
const weights = root.createReadonly(
  definition.Weights(count),
  Array.from({ length: count }, (_, i) => i * 1.5),
);
// Never bound, but written: a disarray codec of a runtime length
root.unwrap(
  root
    .createBuffer(definition.Positions(3), [
      [1, 2],
      [3, 4],
      [5, 6],
    ])
    .$usage('vertex'),
);

const image = root
  .createTexture({ size: [8, 8], format: 'rgba8unorm' })
  .$usage('storage', 'sampled');
const target = root.createTexture({ size: [8, 8], format: 'rgba8unorm' }).$usage('render');

const group = root.createBindGroup(definition.layout, {
  particles,
  weights,
  output: image.createView(definition.Output),
});
// A texture bound as-is gets a view as the layout describes it
const imageGroup = root.createBindGroup(definition.drawLayout, { image });
// As does a raw view
const rawViewGroup = root.createBindGroup(definition.drawLayout, {
  image: root.unwrap(image).createView(),
});

// What a module's recording methods are handed, in dev and on the pruned root
type Encoder = GPUCommandEncoder | TgpuCommandEncoder;
type ComputeTarget = GPUComputePassEncoder | TgpuComputePass | Encoder;
type RenderTarget = GPURenderPassEncoder | GPURenderBundleEncoder | TgpuRenderCommands | Encoder;

const instance = {
  step(pass: ComputeTarget) {
    // One overload per kind in TypeGPU's types, so the union is narrowed by hand
    definition.step
      .with(group)
      .with(pass as GPUComputePassEncoder)
      .dispatchWorkgroups(1);
  },
  draw(pass: RenderTarget, bindGroup = imageGroup) {
    definition.draw
      .with(bindGroup)
      .with(pass as GPURenderPassEncoder)
      .draw(3);
  },
};

// root.createCommandEncoder(), and the passes begun on it
const encoder = root.createCommandEncoder();
const computePass = encoder.beginComputePass();
instance.step(computePass);
computePass.end();
instance.step(encoder);
const renderPass = encoder.beginRenderPass({
  colorAttachments: [{ view: target.createView('render') }],
});
instance.draw(renderPass, rawViewGroup);
renderPass.end();
// Attached to a texture, the pass begun by the pipeline on the encoder
definition.draw.with(imageGroup).withColorAttachment({ view: target }).with(encoder).draw(3);
encoder.submit();

// A raw command encoder, its passes and a render bundle
const rawEncoder = root.device.createCommandEncoder();
const rawComputePass = rawEncoder.beginComputePass();
instance.step(rawComputePass);
rawComputePass.end();
instance.step(rawEncoder);
const bundleEncoder = root.device.createRenderBundleEncoder({ colorFormats: ['rgba8unorm'] });
instance.draw(bundleEncoder);
const bundle = bundleEncoder.finish();
const rawRenderPass = rawEncoder.beginRenderPass({
  colorAttachments: [
    {
      view: root.unwrap(target.createView('render')),
      loadOp: 'clear',
      storeOp: 'store',
    },
  ],
});
instance.draw(rawRenderPass);
rawRenderPass.executeBundles([bundle]);
rawRenderPass.end();
root.device.queue.submit([rawEncoder.finish()]);

image.destroy();
target.destroy();
