import tgpu from 'typegpu';
import * as d from 'typegpu/data';

// Shared data shapes
export const Particle = d.struct({
    position: d.vec3f,
    v: d.vec3f,
    force: d.vec3f,
    density: d.f32,
    nearDensity: d.f32,
});

export const PosVel = d.struct({ position: d.vec3f, v: d.vec3f });

export const SPHParams = d.struct({
    mass: d.f32,
    kernelRadius: d.f32,
    kernelRadiusPow2: d.f32,
    kernelRadiusPow5: d.f32,
    kernelRadiusPow6: d.f32,
    kernelRadiusPow9: d.f32,
    dt: d.f32,
    stiffness: d.f32,
    nearStiffness: d.f32,
    restDensity: d.f32,
    viscosity: d.f32,
    n: d.u32,
});

export const copyPositionLayout = tgpu.bindGroupLayout({
    particles: { storage: d.arrayOf(Particle), access: 'readonly' },
    posvel: { storage: d.arrayOf(PosVel), access: 'mutable' },
    params: { uniform: SPHParams },
});

const { particles, posvel, params } = copyPositionLayout.bound;

export const computeCopyPosition = tgpu['~unstable'].computeFn({ in: { gid: d.builtin.globalInvocationId }, workgroupSize: [64] })(({ gid }) => {
    if (gid.x >= params.value.n) return;
    const p = particles.value[gid.x];
    posvel.value[gid.x].position = p.position;
    posvel.value[gid.x].v = p.v;
});
