import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { Particle, SPHParams } from './copyPosition';

export const Environment = d.struct({
    xGrids: d.i32,
    yGrids: d.i32,
    zGrids: d.i32,
    cellSize: d.f32,
    xHalf: d.f32,
    yHalf: d.f32,
    zHalf: d.f32,
    offset: d.f32,
});

export const densityLayout = tgpu.bindGroupLayout({
    particles: { storage: d.arrayOf(Particle), access: 'mutable' },
    prefixSum: { storage: d.arrayOf(d.u32), access: 'readonly' },
    env: { uniform: Environment },
    params: { uniform: SPHParams },
});

const { particles, prefixSum, env, params } = densityLayout.bound;

const cellNumberFromId = tgpu.fn([d.i32, d.i32, d.i32], d.i32)((xi, yi, zi) =>
    xi + yi * env.value.xGrids + zi * env.value.xGrids * env.value.yGrids
);
const cellPosition = tgpu.fn([d.vec3f], d.vec3i)((v: any) => {
    const xi = d.i32(std.floor((v.x + env.value.xHalf + env.value.offset) / env.value.cellSize));
    const yi = d.i32(std.floor((v.y + env.value.yHalf + env.value.offset) / env.value.cellSize));
    const zi = d.i32(std.floor((v.z + env.value.zHalf + env.value.offset) / env.value.cellSize));
    return d.vec3i(xi, yi, zi);
});

export const computeDensity = tgpu['~unstable'].computeFn({ in: { gid: d.builtin.globalInvocationId }, workgroupSize: [64] })(({ gid }) => {
    if (gid.x >= params.value.n) return;

    const pos_i = particles.value[gid.x].position;
    const v = cellPosition(pos_i);

    let dens = d.f32(0);
    let nearDens = d.f32(0);

    const insideGrid = v.x < env.value.xGrids && 0 <= v.x && v.y < env.value.yGrids && 0 <= v.y && v.z < env.value.zGrids && 0 <= v.z;
    if (insideGrid) {
        const zMin = std.max(-1, -v.z);
        const zMax = std.min(1, env.value.zGrids - v.z - 1);
        for (let dz = zMin; dz <= zMax; dz++) {
            const yMin = std.max(-1, -v.y);
            const yMax = std.min(1, env.value.yGrids - v.y - 1);
            for (let dy = yMin; dy <= yMax; dy++) {
                const dxMin = std.max(-1, -v.x);
                const dxMax = std.min(1, env.value.xGrids - v.x - 1);
                const startCellNum = cellNumberFromId(v.x + dxMin, v.y + dy, v.z + dz);
                const endCellNum = cellNumberFromId(v.x + dxMax, v.y + dy, v.z + dz);
                const start = prefixSum.value[startCellNum];
                const end = prefixSum.value[endCellNum + 1];
                for (let j = start; j < end; j++) {
                    const pos_j = particles.value[j].position;
                    const rVec = pos_i.sub(pos_j);
                    const r2 = std.dot(rVec, rVec);
                    if (r2 < params.value.kernelRadiusPow2) {
                        const r = std.sqrt(r2);
                        const scaleD = 315.0 / (64.0 * Math.PI * params.value.kernelRadiusPow9);
                        const dd = params.value.kernelRadiusPow2 - r * r;
                        const kD = std.max(0, scaleD * dd * dd * dd);
                        const scaleN = 15.0 / (Math.PI * params.value.kernelRadiusPow6);
                        const dRem = params.value.kernelRadius - r;
                        const kN = std.max(0, scaleN * dRem * dRem * dRem);
                        dens += params.value.mass * kD;
                        nearDens += params.value.mass * kN;
                    }
                }
            }
        }
    }

    const pOld = particles.value[gid.x];
    particles.value[gid.x] = Particle({ position: pOld.position, v: pOld.v, force: pOld.force, density: dens, nearDensity: nearDens });
});
