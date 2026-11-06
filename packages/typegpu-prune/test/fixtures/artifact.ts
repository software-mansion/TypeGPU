import { d, tgpu, type TgpuRoot } from 'typegpu';

export default (root: TgpuRoot) => {
  const Particle = d.struct({ position: d.vec3f, mass: d.f32 });
  const World = d.struct({ particles: d.arrayOf(Particle, 4), gravity: d.vec2f });
  const Frame = d.struct({ time: d.f32 });

  const layout = tgpu.bindGroupLayout({
    world: { uniform: World },
    particles: { storage: d.arrayOf(Particle), access: 'mutable' },
  });
  const instances = tgpu.vertexLayout(d.arrayOf(Particle), 'instance');
  const frame = tgpu['~unstable'].immediateVar(Frame);

  const stepFn = tgpu.computeFn({
    workgroupSize: [64],
    in: { gid: d.builtin.globalInvocationId },
  })(({ gid }) => {
    'use gpu';
    const particle = layout.$.particles[gid.x] as d.Infer<typeof Particle>;
    console.log('mass', particle.mass);
    const mass = particle.mass + frame.$.time * layout.$.world.gravity.x;
    layout.$.particles[gid.x] = Particle({ position: particle.position, mass });
  });

  const vertex = tgpu.vertexFn({
    in: { position: d.vec3f },
    out: { pos: d.builtin.position },
  })(({ position }) => {
    'use gpu';
    return { pos: d.vec4f(position, 1) };
  });

  const fragment = tgpu.fragmentFn({ out: { color: d.vec4f, glow: d.vec4f } })(() => {
    'use gpu';
    return { color: d.vec4f(1), glow: d.vec4f(frame.$.time) };
  });

  const step = root.createComputePipeline({ compute: stepFn });
  const draw = root.createRenderPipeline({
    attribs: { position: instances.attrib.position },
    vertex,
    fragment,
    targets: { glow: { format: 'rgba16float' } },
  });

  const Packed = d.unstruct({ tint: d.unorm8x4, offset: d.float32x3 });
  const pinned = tgpu.bindGroupLayout({ scale: { uniform: d.f32 } }).$idx(2);
  const exposure = root.createUniform(d.f32, 0.5);

  return { World, layout, instances, step, draw, Packed, pinned, exposure };
};
